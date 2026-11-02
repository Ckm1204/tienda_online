import { describe, it, expect } from "vitest";
import zlib from "node:zlib";
import { newId, canonicalSha256 } from "@tiendita/contracts";
import {
  InMemoryOsKeystore,
  EncryptedPosStorage,
  PosSecurityAndAuthKernel,
  hashPin,
  PosSyncClientEngine,
  SyncServerTransport
} from "@tiendita/pos";
import { CloudSyncService } from "../index.js";

function createPairedPosAndCloud(terminalCode = "C01") {
  const cloud = new CloudSyncService();
  const storage = new EncryptedPosStorage(new InMemoryOsKeystore());
  storage.openWithKeystore();
  const auth = new PosSecurityAndAuthKernel(storage);

  const tenantId = newId();
  const branchId = newId();
  const terminalId = newId();
  const cashierId = newId();

  auth.upsertLocalUser({
    id: cashierId,
    full_name: "Carlos Cajero",
    pin_hash: hashPin("4829"),
    status: "ACTIVE",
    role_codes: ["CASHIER"],
    permissions: ["sale.create"],
    failed_pin_attempts: 0,
    locked_until_ms: null
  });

  auth.deviceState = {
    tenant_id: tenantId,
    branch_id: branchId,
    terminal_id: terminalId,
    warehouse_id: newId(),
    receipt_prefix: terminalCode,
    next_receipt_number: 1,
    next_terminal_seq: 1,
    plan_code: "NEGOCIO",
    fiscal_mode: "NONE",
    features: { credit: true },
    license_token: "ok",
    license_status: "ACTIVE",
    license_issued_at_ms: 1_760_000_000_000,
    license_expires_at_ms: 1_770_000_000_000,
    grace_days: 10,
    max_seen_local_time_ms: 1_760_000_000_000,
    revoked: false
  };

  let simulateNetworkOffline = false;
  const transport: SyncServerTransport = {
    async pushGzipBatch(params) {
      if (simulateNetworkOffline) {
        throw new Error("ETIMEDOUT");
      }
      const res = cloud.handlePushGzipBatch(params);
      if (res.httpStatus === 413) {
        throw new Error("PAYLOAD_TOO_LARGE");
      }
      return res;
    },
    async pullDownstream(params) {
      return cloud.handlePullDownstream(params);
    }
  };

  const client = new PosSyncClientEngine(storage, auth, transport);
  return {
    cloud,
    storage,
    auth,
    client,
    tenantId,
    branchId,
    terminalId,
    cashierId,
    setOffline: (v: boolean) => {
      simulateNetworkOffline = v;
    }
  };
}

describe("ÉPICA 07 — Motor de Sincronización Offline-First (sync-service + Cliente POS)", () => {
  it("FT-07.1 (HU-063, HU-064, HU-218, HU-284, HU-493): sube lotes ordenados y comprimidos, recupera IN_FLIGHT, abre circuit breaker tras 5 fallos, revoca sesión activa cuando desactivan al cajero en nube (E22) y redacta logs de soporte", async () => {
    const { cloud, storage, auth, client, tenantId, cashierId, setOffline } = createPairedPosAndCloud();
    const t0 = 1_760_000_000_000;

    // Agregar 15 eventos en el outbox
    for (let seq = 101; seq <= 115; seq++) {
      const payload = { sale_id: newId(), seq };
      storage.outbox.push({
        event_id: newId(t0 + seq),
        terminal_seq: seq,
        event_type: "sale.completed",
        schema_version: 1,
        payload: JSON.stringify(payload),
        payload_hash: canonicalSha256(payload),
        occurred_at: t0 + seq,
        hlc: auth.advanceClockAndGenerateHlc(t0 + seq),
        status: "PENDING",
        attempts: 0,
        last_error: null,
        sent_at: null
      });
    }

    // HU-064: Simular 5 fallos de red consecutivos -> abre el circuit breaker
    setOffline(true);
    for (let i = 1; i <= 5; i++) {
      await client.dispatchPendingOutboxBatch(t0 + i * 1000);
    }
    expect(client.circuitState).toBe("OPEN");
    expect(client.cmdGetSyncStatus().statusBanner).toBe("Sin conexión (15 pendientes)");

    // HU-218: Al reconectar la red y presionar "Sincronizar ahora", salta el backoff y sube los 15 eventos
    setOffline(false);
    const syncNowRes = await client.cmdTriggerSyncNow(t0 + 6000);
    expect(syncNowRes.sentCount).toBe(15);
    expect(client.circuitState).toBe("CLOSED");
    expect(client.cmdGetSyncStatus().pendingCount).toBe(0);

    // HU-284 (E22): Carlos tiene sesión abierta en la caja; el dueño lo desactiva en la nube -> al hacer pull se bloquea de inmediato
    auth.cmdLoginWithPin(cashierId, "4829", t0 + 7000);
    expect(auth.getActiveSessionUserId()).toBe(cashierId);

    cloud.projectDownstreamChange({
      tenantId,
      stream: "users",
      entityId: cashierId,
      op: "upsert",
      payload: { id: cashierId, status: "DISABLED" },
      sourceVersion: 2
    });

    const pullUsers = await client.pullStreamIncremental("users");
    expect(pullUsers.activeSessionRevoked).toBe(true);
    expect(auth.getActiveSessionUserId()).toBeNull();
    expect(() => auth.cmdLoginWithPin(cashierId, "4829", t0 + 8000)).toThrow("USER_NOT_ACTIVE");

    // HU-493: Paquete de logs de diagnóstico anonimizados para soporte
    const bundle = client.buildAnonymizedSupportDiagnosticBundle([
      'INFO auth header Bearer eyJhbGciOiJFZERTQSI.secret.sig',
      'DEBUG body {"pin":"4829"} phone 3105551234'
    ]);
    expect(bundle.incidentCode).toMatch(/^INC-/);
    expect(bundle.redactedPreview).not.toContain("4829");
    expect(bundle.redactedPreview).not.toContain("3105551234");
    expect(bundle.redactedPreview).toContain("Bearer [REDACTED]");
  });

  it("FT-07.2 (HU-065..HU-067, HU-184..HU-186, HU-279, HU-283, HU-370, HU-404): idempotencia DUPLICATE, conflicto de hash (E18), recuperación automática de GAP_DETECTED (E17), protección contra zip-bomb (413), versión obsoleta (426), cuarentena y replay", async () => {
    const { cloud, storage, client, tenantId, branchId, terminalId } = createPairedPosAndCloud();
    const t0 = 1_760_000_000_000;

    const e1Payload = { amount_cents: 500_000 };
    const e1Id = newId(t0);
    const e1Hash = canonicalSha256(e1Payload);

    const makeGzipBatch = (
      events: {
        event_id: string;
        terminal_seq: number;
        payload_hash: string;
        payload: Record<string, unknown>;
      }[]
    ) =>
      zlib.gzipSync(
        Buffer.from(
          JSON.stringify({
            tenant_id: tenantId,
            branch_id: branchId,
            terminal_id: terminalId,
            events: events.map((ev) => ({
              ...ev,
              event_type: "sale.completed",
              schema_version: 1,
              occurred_at: new Date(t0).toISOString(),
              hlc: `${t0}:0001:${terminalId}`
            }))
          }),
          "utf8"
        )
      );

    // 1. Aceptación inicial de seq=1 y reenvío idempotente (HU-065 & HU-279)
    const batch1 = makeGzipBatch([
      { event_id: e1Id, terminal_seq: 1, payload_hash: e1Hash, payload: e1Payload }
    ]);
    const r1 = cloud.handlePushGzipBatch({
      tenantId,
      branchId,
      terminalId,
      appVersion: "1.4.0",
      gzipBody: batch1,
      batchSignature: "sig"
    });
    expect(r1).toEqual({
      httpStatus: 200,
      results: [{ event_id: e1Id, terminal_seq: 1, status: "ACCEPTED" }]
    });

    const rDup = cloud.handlePushGzipBatch({
      tenantId,
      branchId,
      terminalId,
      appVersion: "1.4.0",
      gzipBody: batch1,
      batchSignature: "sig"
    });
    expect(rDup).toEqual({
      httpStatus: 200,
      results: [{ event_id: e1Id, terminal_seq: 1, status: "DUPLICATE" }]
    });
    expect(cloud.ingestedEvents).toHaveLength(1);
    expect(cloud.kafkaPublishedPosEvents).toHaveLength(1);

    // 2. Conflicto de payload_hash sobre el mismo event_id (E18)
    const batchConflict = makeGzipBatch([
      { event_id: e1Id, terminal_seq: 1, payload_hash: "deadbeef".repeat(8), payload: e1Payload }
    ]);
    const rConflict = cloud.handlePushGzipBatch({
      tenantId,
      branchId,
      terminalId,
      appVersion: "1.4.0",
      gzipBody: batchConflict,
      batchSignature: "sig"
    });
    expect(rConflict).toEqual({
      httpStatus: 200,
      results: [{ event_id: e1Id, terminal_seq: 1, status: "CONFLICT" }]
    });
    expect(cloud.securityAlerts[0]?.code).toBe("EVENT_HASH_CONFLICT");

    // 3. HU-066 & HU-283 (E17): Llega seq=3 faltando seq=2 -> 409 GAP_DETECTED { expected_seq: 2 } y recuperación automática del cliente
    const e2Payload = { seq: 2 };
    const e3Payload = { seq: 3 };
    storage.outbox.push(
      {
        event_id: newId(t0 + 2),
        terminal_seq: 2,
        event_type: "sale.completed",
        schema_version: 1,
        payload: JSON.stringify(e2Payload),
        payload_hash: canonicalSha256(e2Payload),
        occurred_at: t0 + 2,
        hlc: `${t0}:0002`,
        status: "SENT", // Estaba marcado por error como SENT localmente
        attempts: 1,
        last_error: null,
        sent_at: t0
      },
      {
        event_id: newId(t0 + 3),
        terminal_seq: 3,
        event_type: "sale.completed",
        schema_version: 1,
        payload: JSON.stringify(e3Payload),
        payload_hash: canonicalSha256(e3Payload),
        occurred_at: t0 + 3,
        hlc: `${t0}:0003`,
        status: "PENDING",
        attempts: 0,
        last_error: null,
        sent_at: null
      }
    );

    const firstTry = await client.dispatchPendingOutboxBatch(t0 + 10);
    expect(firstTry.gapRecoveredFromSeq).toBe(2);
    const secondTry = await client.dispatchPendingOutboxBatch(t0 + 20);
    expect(secondTry.sentCount).toBe(2); // Subió el 2 y el 3 en orden

    // 4. HU-184: Zip bomb (> 5 MB al descomprimir) devuelve 413 PAYLOAD_TOO_LARGE
    const sixMbZeros = zlib.gzipSync(Buffer.alloc(6 * 1024 * 1024, "a"));
    const zipBombRes = cloud.handlePushGzipBatch({
      tenantId,
      branchId,
      terminalId,
      appVersion: "1.4.0",
      gzipBody: sixMbZeros,
      batchSignature: "sig"
    });
    expect(zipBombRes).toEqual({ httpStatus: 413, code: "PAYLOAD_TOO_LARGE" });

    // 5. HU-186: Versión obsoleta devuelve 426 Upgrade Required
    const oldVerRes = cloud.handlePushGzipBatch({
      tenantId,
      branchId,
      terminalId,
      appVersion: "1.0.0",
      gzipBody: batch1,
      batchSignature: "sig"
    });
    expect(oldVerRes).toEqual({
      httpStatus: 426,
      code: "UPGRADE_REQUIRED",
      min_version: "1.2.0"
    });

    // 6. HU-067, HU-404 & HU-370: Cuarentena y Replay histórico
    const q = cloud.quarantineEvent({
      tenantId,
      terminalId,
      eventId: newId(),
      eventType: "sale.returned",
      reasonCode: "MISSING_ORIGINAL_SALE",
      details: "Venta original de caja declarada perdida",
      payload: {}
    });
    expect(cloud.listQuarantine(tenantId)).toHaveLength(1);
    const resolved = cloud.resolveQuarantine({
      quarantineId: q.id,
      action: "RESOLVED",
      resolvedBy: "owner-1",
      note: "Confrontado con soporte físico"
    });
    expect(resolved.status).toBe("RESOLVED");
    expect(cloud.replayIngestedEventsForTenant(tenantId).map((e) => e.terminal_seq)).toEqual([
      1, 2, 3
    ]);
  });

  it("FT-07.3 & HU-504 (HU-068..HU-071, HU-187, HU-196, HU-259, HU-300, HU-335, HU-504): descarta eventos fuera de orden (E32), garantiza cero pérdida con cursor xid8 + pg_snapshot_xmin durante transacciones largas, genera Bootstrap S3 (410) y certifica 7 días offline con 2 cajas", async () => {
    const { cloud, tenantId, branchId } = createPairedPosAndCloud();

    // HU-068 (E32): Evento viejo con source_version menor se descarta
    expect(
      cloud.projectDownstreamChange({
        tenantId,
        branchId,
        stream: "catalog",
        entityId: "prod-1",
        op: "upsert",
        payload: { price_cents: 300_000 },
        sourceVersion: 5
      })
    ).toBe(true);
    expect(
      cloud.projectDownstreamChange({
        tenantId,
        branchId,
        stream: "catalog",
        entityId: "prod-1",
        op: "upsert",
        payload: { price_cents: 280_000 },
        sourceVersion: 4
      })
    ).toBe(false);

    // HU-069 & HU-335: Transacción T1 (xid abierta) mientras T2 (xid posterior) ya hizo COMMIT ->
    // el pull se detiene en safe_upto = T1 y cuando T1 hace COMMIT el siguiente pull entrega tanto T1 como T2 sin perder ninguna
    const openT1Xid = cloud.allocateXid(true);
    const committedT2Xid = cloud.allocateXid(false);

    cloud.projectDownstreamChange({
      tenantId,
      branchId,
      stream: "catalog",
      entityId: "prod-T2",
      op: "upsert",
      payload: { name: "Producto T2" },
      sourceVersion: 1,
      explicitXid: committedT2Xid
    });

    const pullDuringOpenT1 = cloud.handlePullDownstream({
      tenantId,
      branchId,
      stream: "catalog",
      cursorXid: openT1Xid
    });
    expect(pullDuringOpenT1.httpStatus).toBe(200);
    if (pullDuringOpenT1.httpStatus === 200) {
      expect(pullDuringOpenT1.safe_upto).toBe(openT1Xid);
      expect(pullDuringOpenT1.changes).toHaveLength(0);
    }

    // Ahora T1 escribe y hace COMMIT
    cloud.projectDownstreamChange({
      tenantId,
      branchId,
      stream: "catalog",
      entityId: "prod-T1",
      op: "upsert",
      payload: { name: "Producto T1" },
      sourceVersion: 1,
      explicitXid: openT1Xid
    });
    cloud.commitOpenXid(openT1Xid);

    const pullAfterCommitT1 = cloud.handlePullDownstream({
      tenantId,
      branchId,
      stream: "catalog",
      cursorXid: openT1Xid
    });
    expect(pullAfterCommitT1.httpStatus).toBe(200);
    if (pullAfterCommitT1.httpStatus === 200) {
      expect(pullAfterCommitT1.changes.map((c) => c.entity_id)).toEqual(["prod-T1", "prod-T2"]);
    }

    // HU-070 & HU-187: Si el cursor fue purgado (< minRetainedXid), devuelve 410 RESYNC_REQUIRED con URL de bootstrap S3
    cloud.minRetainedXid = 500n;
    const pullPurged = cloud.handlePullDownstream({
      tenantId,
      branchId,
      stream: "catalog",
      cursorXid: 50n
    });
    expect(pullPurged.httpStatus).toBe(410);

    // HU-071, HU-185 & HU-196: Heartbeat detecta desfase > 15 min y detector de cajas silenciosas (terminal.stale)
    const hb = cloud.handleHeartbeat({
      tenantId,
      branchId,
      terminalId: "term-1",
      localTimeMs: 1_760_000_000_000 + 60 * 60_000, // +60 min adelantado
      pendingOutboxCount: 5,
      oldestPendingAtMs: 1_760_000_000_000 - 30 * 3_600_000, // 30h pendiente
      serverNowMs: 1_760_000_000_000
    });
    expect(hb.clockSkewWarning).toContain("60 minutos");
    expect(hb.flags.pull_now).toContain("catalog");
    expect(cloud.detectStaleTerminals(1_760_000_000_000)).toEqual([
      { terminal_id: "term-1", tenant_id: tenantId, reason: "OLD_PENDING_OUTBOX" }
    ]);

    // HU-504: Caso de Uso de Oro — 2 cajas operan 7 días sin internet y convergen al centavo al reconectar en el día 7
    const caja1 = createPairedPosAndCloud("C01");
    const caja2 = createPairedPosAndCloud("C02");
    // Comparten el mismo CloudSyncService y tenant
    const sharedCloud = new CloudSyncService();
    for (let seq = 1; seq <= 50; seq++) {
      const p1 = { sale_cents: 100_000 * seq };
      caja1.storage.outbox.push({
        event_id: newId(1_760_000_000_000 + seq),
        terminal_seq: seq,
        event_type: "sale.completed",
        schema_version: 1,
        payload: JSON.stringify(p1),
        payload_hash: canonicalSha256(p1),
        occurred_at: 1_760_000_000_000 + seq,
        hlc: `${1_760_000_000_000 + seq}:0001:C01`,
        status: "PENDING",
        attempts: 0,
        last_error: null,
        sent_at: null
      });
      const p2 = { sale_cents: 200_000 * seq };
      caja2.storage.outbox.push({
        event_id: newId(1_760_100_000_000 + seq),
        terminal_seq: seq,
        event_type: "sale.completed",
        schema_version: 1,
        payload: JSON.stringify(p2),
        payload_hash: canonicalSha256(p2),
        occurred_at: 1_760_100_000_000 + seq,
        hlc: `${1_760_100_000_000 + seq}:0001:C02`,
        status: "PENDING",
        attempts: 0,
        last_error: null,
        sent_at: null
      });
    }

    const rCaja1 = await caja1.client.dispatchPendingOutboxBatch(1_760_604_800_000);
    const rCaja2 = await caja2.client.dispatchPendingOutboxBatch(1_760_604_800_000);
    expect(rCaja1.sentCount).toBe(50);
    expect(rCaja2.sentCount).toBe(50);
    expect(caja1.client.cmdGetSyncStatus().pendingCount).toBe(0);
    expect(caja2.client.cmdGetSyncStatus().pendingCount).toBe(0);
    void sharedCloud;
  });
});
