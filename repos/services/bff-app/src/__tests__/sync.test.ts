import { describe, it, expect, beforeEach } from "vitest";
import zlib from "node:zlib";
import { canonicalSha256 } from "@tiendita/contracts";
import { BffApp, type HttpRequest } from "../index.js";

describe("ÉPICA 07 & 10 — BFF Gateway: Sincronización Nube / POS (push, pull, heartbeat, cuarentena)", () => {
  let bff: BffApp;
  let tenantId: string;
  let branchId: string;
  let terminalId: string;
  let t0: number;

  beforeEach(() => {
    bff = new BffApp();
    t0 = 1_760_000_000_000;
    tenantId = "tenant-sync-co-1";
    branchId = "branch-principal";
    terminalId = "term-caja-01";
  });

  it("POST /v1/sync/push: Rechaza 400 cuando falta contexto de tienda/terminal", async () => {
    const req: HttpRequest = {
      method: "POST",
      path: "/v1/sync/push",
      ip: "190.14.20.1",
      headers: {},
      body: { events: [] }
    };
    const res = await bff.handleRequest(req, t0);
    expect(res.status).toBe(400);
    expect((res.body as any).error).toBe("MISSING_SYNC_CONTEXT");
  });

  it("POST /v1/sync/push: Procesa lote gzipeado, deduce idempotencia y consolida ventas en Libro Fiscal", async () => {
    const payload = {
      tenant_id: tenantId,
      branch_id: branchId,
      terminal_id: terminalId,
      events: [
        {
          event_id: "evt-sync-sale-001",
          terminal_seq: 1,
          event_type: "sale.completed",
          schema_version: 1,
          payload: {
            sale_id: "sale-sync-001",
            receipt_prefix: "POS",
            receipt_number: 101,
            cash_session_id: "session-01",
            cashier_id: "cajero-01",
            total_cents: 25_000_00,
            lines: [
              {
                line_id: "l-1",
                product_id: "prod-arroz",
                description: "Arroz Diana 1kg",
                qty_milli: 2000,
                unit_price_cents: 5_000_00,
                line_total_cents: 10_000_00,
                tax_rate_bps: 0
              },
              {
                line_id: "l-2",
                product_id: "prod-cafe",
                description: "Café Sello Rojo 500g",
                qty_milli: 1000,
                unit_price_cents: 15_000_00,
                line_total_cents: 15_000_00,
                tax_rate_bps: 1900
              }
            ],
            payments: [
              {
                payment_id: "pm-1",
                method: "CASH",
                amount_cents: 25_000_00,
                reference: null
              }
            ]
          },
          payload_hash: canonicalSha256({
            sale_id: "sale-sync-001",
            total_cents: 25_000_00
          }),
          occurred_at: new Date(t0).toISOString(),
          hlc: `${t0}:0:term-caja-01`
        }
      ]
    };

    const gzipBuffer = zlib.gzipSync(Buffer.from(JSON.stringify(payload), "utf-8"));

    const pushReq: HttpRequest = {
      method: "POST",
      path: "/v1/sync/push",
      ip: "190.14.20.1",
      headers: {
        "content-encoding": "gzip",
        "x-tenant-id": tenantId,
        "x-branch-id": branchId,
        "x-terminal-id": terminalId,
        "x-app-version": "1.4.0",
        "x-batch-signature": "ed25519-valid-sig"
      },
      body: gzipBuffer
    };

    const pushRes = await bff.handleRequest(pushReq, t0);
    expect(pushRes.status).toBe(200);
    const body = pushRes.body as any;
    expect(body.results).toHaveLength(1);
    expect(body.results[0].status).toBe("ACCEPTED");
    expect(body.ack_up_to_seq).toBe(1);

    // Verificar deduplicación en segundo intento exacto
    const dupRes = await bff.handleRequest(pushReq, t0 + 1000);
    expect(dupRes.status).toBe(200);
    expect((dupRes.body as any).results[0].status).toBe("DUPLICATE");

    // Verificar que la venta fue consolidada en el sales-service
    const recordedSale = bff.salesService.sales.get("sale-sync-001");
    expect(recordedSale).toBeDefined();
    expect(recordedSale?.total_cents).toBe(25_000_00);
  });

  it("POST /v1/sync/push: Detecta brecha de secuencia (GAP_DETECTED - 409) si salta terminal_seq", async () => {
    // Establecer secuencia actual en 1
    bff.syncService.terminalLastSeq.set(terminalId, 1);

    const gapPayload = {
      tenant_id: tenantId,
      branch_id: branchId,
      terminal_id: terminalId,
      events: [
        {
          event_id: "evt-sync-gap-003",
          terminal_seq: 3, // Salto de 1 a 3 (falta 2)
          event_type: "cash.movement",
          schema_version: 1,
          payload: { amount_cents: 5_000_00 },
          payload_hash: "hash-003",
          occurred_at: new Date(t0).toISOString(),
          hlc: `${t0}:0:term-caja-01`
        }
      ]
    };

    const req: HttpRequest = {
      method: "POST",
      path: "/v1/sync/push",
      ip: "190.14.20.1",
      headers: {
        "x-tenant-id": tenantId,
        "x-branch-id": branchId,
        "x-terminal-id": terminalId,
        "x-app-version": "1.4.0"
      },
      body: gapPayload
    };

    const res = await bff.handleRequest(req, t0);
    expect(res.status).toBe(409);
    expect((res.body as any).error).toBe("GAP_DETECTED");
    expect((res.body as any).expected_seq).toBe(2);

    // Con justificación de pérdida declarada (E02 / declared_loss_reason)
    const lossReq: HttpRequest = {
      ...req,
      headers: {
        ...req.headers,
        "x-declared-loss-reason": "Cierre forzoso de caja por daño en disco local"
      }
    };
    const lossRes = await bff.handleRequest(lossReq, t0);
    expect(lossRes.status).toBe(200);
    expect((lossRes.body as any).results[0].status).toBe("ACCEPTED");
  });

  it("POST /v1/sync/push: Rechaza 426 UPGRADE_REQUIRED si la app está desactualizada", async () => {
    const req: HttpRequest = {
      method: "POST",
      path: "/v1/sync/push",
      ip: "190.14.20.1",
      headers: {
        "x-tenant-id": tenantId,
        "x-branch-id": branchId,
        "x-terminal-id": terminalId,
        "x-app-version": "1.0.5" // Mínimo soportado es 1.2.0
      },
      body: { events: [] }
    };
    const res = await bff.handleRequest(req, t0);
    expect(res.status).toBe(426);
    expect((res.body as any).error).toBe("UPGRADE_REQUIRED");
    expect((res.body as any).min_version).toBe("1.2.0");
  });

  it("GET /v1/sync/pull: Permite descarga incremental por cursor xid8 y responde 410 ante purga", async () => {
    // 1. Proyectar cambio downstream en catálogo
    bff.syncService.projectDownstreamChange({
      tenantId,
      branchId,
      stream: "catalog",
      entityId: "prod-aceite",
      op: "upsert",
      payload: { name: "Aceite Premier 1000ml", price_cents: 14_000_00 },
      sourceVersion: 1
    });

    // 2. Pull con cursor inicial 0
    const pullReq: HttpRequest = {
      method: "GET",
      path: `/v1/sync/pull?stream=catalog&cursor_xid=0`,
      ip: "190.14.20.1",
      headers: {
        "x-tenant-id": tenantId,
        "x-branch-id": branchId
      }
    };

    const pullRes = await bff.handleRequest(pullReq, t0);
    expect(pullRes.status).toBe(200);
    const body = pullRes.body as any;
    expect(body.stream).toBe("catalog");
    expect(body.changes).toHaveLength(1);
    expect(body.changes[0].entity_id).toBe("prod-aceite");
    expect(body.safe_upto).toBeDefined();

    // 3. Caso borde: Cursor muy viejo purgado de la base de datos (E11 / HU-070)
    bff.syncService.minRetainedXid = 500n;
    const stalePullReq: HttpRequest = {
      method: "GET",
      path: `/v1/sync/pull?stream=catalog&cursor_xid=50`,
      ip: "190.14.20.1",
      headers: {
        "x-tenant-id": tenantId,
        "x-branch-id": branchId
      }
    };
    const staleRes = await bff.handleRequest(stalePullReq, t0);
    expect(staleRes.status).toBe(410);
    expect((staleRes.body as any).error).toBe("RESYNC_REQUIRED");
    expect((staleRes.body as any).bootstrap_url).toContain("/bootstrap/");
  });

  it("POST /v1/terminals/heartbeat: Registra latido y alerta desfase de reloj superior a 15 min", async () => {
    // Latido normal sincronizado
    const hbReq: HttpRequest = {
      method: "POST",
      path: "/v1/terminals/heartbeat",
      ip: "190.14.20.1",
      headers: { "content-type": "application/json" },
      body: {
        tenant_id: tenantId,
        branch_id: branchId,
        terminal_id: terminalId,
        local_time_ms: t0,
        pending_outbox_count: 3
      }
    };

    const hbRes = await bff.handleRequest(hbReq, t0);
    expect(hbRes.status).toBe(200);
    expect((hbRes.body as any).clock_skew_warning).toBeNull();

    // Latido con reloj local desfasado en 25 minutos
    const skewedHbReq: HttpRequest = {
      ...hbReq,
      body: {
        tenant_id: tenantId,
        branch_id: branchId,
        terminal_id: terminalId,
        local_time_ms: t0 - 25 * 60 * 1000,
        pending_outbox_count: 0
      }
    };
    const skewedRes = await bff.handleRequest(skewedHbReq, t0);
    expect(skewedRes.status).toBe(200);
    expect((skewedRes.body as any).clock_skew_warning).toContain("25 minutos");
  });

  it("Cuarentena: Lista y resuelve eventos retenidos con auditoría (HU-067 & HU-404)", async () => {
    // Ingresar evento en cuarentena manualmente
    const qRec = bff.syncService.quarantineEvent({
      tenantId,
      terminalId,
      eventId: "evt-corrupt-001",
      eventType: "sale.completed",
      reasonCode: "SCHEMA_MISMATCH",
      details: "Falta desglose de IVA requerido",
      payload: { raw: "invalid" },
      nowMs: t0
    });

    const mgmtClaims = {
      sub: "owner-01",
      tid: tenantId,
      roles: ["OWNER"],
      perms: ["terminal.read", "terminal.manage"],
      aud: "mgmt-app" as const
    };

    // 1. Listar cuarentena
    const listReq: HttpRequest = {
      method: "GET",
      path: "/v1/app/quarantine",
      ip: "190.14.20.1",
      headers: { "content-type": "application/json" },
      claims: mgmtClaims
    };

    const listRes = await bff.handleRequest(listReq, t0);
    expect(listRes.status).toBe(200);
    expect((listRes.body as any).items).toHaveLength(1);
    expect((listRes.body as any).items[0].id).toBe(qRec.id);

    // 2. Resolver evento en cuarentena
    const resolveReq: HttpRequest = {
      method: "POST",
      path: `/v1/app/quarantine/${qRec.id}/resolve`,
      ip: "190.14.20.1",
      headers: { "content-type": "application/json" },
      claims: mgmtClaims,
      body: {
        action: "RESOLVED",
        note: "Corregido y reenviado por soporte técnico"
      }
    };

    const resolveRes = await bff.handleRequest(resolveReq, t0);
    expect(resolveRes.status).toBe(200);
    expect((resolveRes.body as any).resolved).toBe(true);
    expect((resolveRes.body as any).record.status).toBe("RESOLVED");
    expect((resolveRes.body as any).record.resolution_note).toContain("soporte técnico");
  });
});
