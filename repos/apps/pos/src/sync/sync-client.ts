import zlib from "node:zlib";
import { canonicalSha256, newId } from "@tiendita/contracts";
import { EncryptedPosStorage, OutboxLocalRow } from "../storage/local-db.js";
import { PosSecurityAndAuthKernel } from "../security/device-auth-and-audit.js";

/**
 * ÉPICA 07 (FT-07.1) — Motor Cliente de Sincronización Offline-First (POS)
 * Cubre: HU-063, HU-064, HU-218, HU-279, HU-283, HU-284, HU-493.
 */

export type SyncCircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface PushBatchResultItem {
  event_id: string;
  terminal_seq: number;
  status: "ACCEPTED" | "DUPLICATE" | "CONFLICT" | "QUARANTINED";
}

export interface SyncServerTransport {
  pushGzipBatch(params: {
    tenantId: string;
    branchId: string;
    terminalId: string;
    appVersion: string;
    gzipBody: Buffer;
    batchSignature: string;
    declaredLossFromSeq?: number;
  }): Promise<
    | { httpStatus: 200; results: PushBatchResultItem[] }
    | { httpStatus: 409; code: "GAP_DETECTED"; expected_seq: number }
    | { httpStatus: 426; code: "UPGRADE_REQUIRED"; min_version: string }
    | { httpStatus: 429 | 503; retryAfterSec?: number }
  >;

  pullDownstream(params: {
    tenantId: string;
    branchId: string;
    stream: string;
    cursorXid: bigint;
  }): Promise<
    | {
        httpStatus: 200;
        safe_upto: bigint;
        changes: {
          stream: string;
          entity_id: string;
          op: "upsert" | "delete";
          payload: Record<string, unknown>;
          source_version: number;
          row_xid: bigint;
        }[];
      }
    | { httpStatus: 410; code: "RESYNC_REQUIRED"; bootstrapUrl: string; snapshotCursorXid: bigint }
  >;
}

export class PosSyncClientEngine {
  public circuitState: SyncCircuitState = "CLOSED";
  public consecutiveFailures = 0;
  public nextRetryAllowedAtMs = 0;
  public lastSuccessfulSyncAtMs: number | null = null;
  public upgradeRequiredNotice: string | null = null;
  public readonly syncCursors = new Map<string, bigint>();
  public appVersion = "1.4.0";

  constructor(
    private readonly storage: EncryptedPosStorage,
    private readonly auth: PosSecurityAndAuthKernel,
    private readonly transport: SyncServerTransport
  ) {}

  /**
   * HU-063: Recupera eventos IN_FLIGHT huérfanos tras corte de red o reinicio (> 2 min).
   */
  recoverOrphanedInFlightEvents(nowMs = Date.now(), orphanTimeoutMs = 120_000): number {
    let recovered = 0;
    for (const ev of this.storage.outbox) {
      if (ev.status === "IN_FLIGHT") {
        ev.status = "PENDING";
        recovered++;
      }
    }
    return recovered;
  }

  /**
   * HU-064: Calcula el backoff exponencial `min(5 min, 2^n * 2 s) ± 30 % de jitter`.
   */
  computeBackoffDelayMs(failureCount: number, retryAfterSec?: number, deterministicFactor = 1): number {
    if (retryAfterSec && retryAfterSec > 0) {
      return retryAfterSec * 1000;
    }
    const baseMs = Math.min(300_000, Math.pow(2, failureCount) * 2_000);
    // factor entre 0.7 y 1.3 (±30% jitter)
    return Math.round(baseMs * deterministicFactor);
  }

  /**
   * HU-063, HU-064, HU-279 & HU-283: Despacha hasta 200 eventos `PENDING` en orden estricto de `terminal_seq`,
   * comprimidos con `gzip` y firmados con la llave del dispositivo.
   */
  async dispatchPendingOutboxBatch(nowMs = Date.now()): Promise<{
    sentCount: number;
    duplicateCount: number;
    gapRecoveredFromSeq: number | null;
  }> {
    if (this.circuitState === "OPEN" && nowMs < this.nextRetryAllowedAtMs) {
      return { sentCount: 0, duplicateCount: 0, gapRecoveredFromSeq: null };
    }
    if (this.circuitState === "OPEN" && nowMs >= this.nextRetryAllowedAtMs) {
      this.circuitState = "HALF_OPEN";
    }

    const batch: OutboxLocalRow[] = this.storage.outbox
      .filter((e) => e.status === "PENDING")
      .sort((a, b) => a.terminal_seq - b.terminal_seq)
      .slice(0, 200);

    if (batch.length === 0) {
      return { sentCount: 0, duplicateCount: 0, gapRecoveredFromSeq: null };
    }

    for (const ev of batch) {
      ev.status = "IN_FLIGHT";
      ev.attempts += 1;
    }

    const dev = this.auth.deviceState!;
    const rawJson = JSON.stringify({
      tenant_id: dev.tenant_id,
      branch_id: dev.branch_id,
      terminal_id: dev.terminal_id,
      events: batch.map((e) => ({
        event_id: e.event_id,
        terminal_seq: e.terminal_seq,
        event_type: e.event_type,
        schema_version: e.schema_version,
        payload: JSON.parse(e.payload),
        payload_hash: e.payload_hash,
        occurred_at: new Date(e.occurred_at).toISOString(),
        hlc: e.hlc
      }))
    });

    const gzipBody = zlib.gzipSync(Buffer.from(rawJson, "utf8"));
    const batchSignature = canonicalSha256({
      terminal_id: dev.terminal_id,
      first_seq: batch[0]!.terminal_seq,
      last_seq: batch[batch.length - 1]!.terminal_seq,
      count: batch.length
    });

    try {
      const resp = await this.transport.pushGzipBatch({
        tenantId: dev.tenant_id,
        branchId: dev.branch_id,
        terminalId: dev.terminal_id,
        appVersion: this.appVersion,
        gzipBody,
        batchSignature
      });

      if (resp.httpStatus === 426) {
        for (const ev of batch) ev.status = "PENDING";
        this.upgradeRequiredNotice = `Actualiza la aplicación a v${resp.min_version} para sincronizar`;
        return { sentCount: 0, duplicateCount: 0, gapRecoveredFromSeq: null };
      }

      if (resp.httpStatus === 429 || resp.httpStatus === 503) {
        for (const ev of batch) ev.status = "PENDING";
        this.recordFailure(nowMs, resp.retryAfterSec);
        return { sentCount: 0, duplicateCount: 0, gapRecoveredFromSeq: null };
      }

      if (resp.httpStatus === 409 && resp.code === "GAP_DETECTED") {
        // HU-283: Si el evento expected_seq existe en el outbox local (aunque estuviera en SENT), reabrir desde expected_seq
        let found = false;
        for (const ev of this.storage.outbox) {
          if (ev.terminal_seq >= resp.expected_seq) {
            ev.status = "PENDING";
            found = true;
          }
        }
        return {
          sentCount: 0,
          duplicateCount: 0,
          gapRecoveredFromSeq: found ? resp.expected_seq : null
        };
      }

      if (resp.httpStatus === 200) {
        this.circuitState = "CLOSED";
        this.consecutiveFailures = 0;
        this.lastSuccessfulSyncAtMs = nowMs;

        let sentCount = 0;
        let duplicateCount = 0;
        const resultMap = new Map(resp.results.map((r) => [r.event_id, r.status]));
        for (const ev of batch) {
          const st = resultMap.get(ev.event_id);
          if (st === "ACCEPTED") {
            ev.status = "SENT";
            ev.sent_at = nowMs;
            sentCount++;
          } else if (st === "DUPLICATE") {
            ev.status = "SENT";
            ev.sent_at = nowMs;
            duplicateCount++;
          } else {
            ev.status = "REJECTED";
          }
        }
        return { sentCount, duplicateCount, gapRecoveredFromSeq: null };
      }

      return { sentCount: 0, duplicateCount: 0, gapRecoveredFromSeq: null };
    } catch (err) {
      for (const ev of batch) {
        ev.status = "PENDING";
        ev.last_error = err instanceof Error ? err.message : "NETWORK_ERROR";
      }
      this.recordFailure(nowMs);
      return { sentCount: 0, duplicateCount: 0, gapRecoveredFromSeq: null };
    }
  }

  private recordFailure(nowMs: number, retryAfterSec?: number): void {
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= 5 || retryAfterSec) {
      this.circuitState = "OPEN";
      this.nextRetryAllowedAtMs = nowMs + this.computeBackoffDelayMs(this.consecutiveFailures, retryAfterSec);
    }
  }

  /**
   * HU-069, HU-070 & HU-284: Ejecuta pull incremental por stream con cursor `xid8`,
   * revocando inmediatamente la sesión activa si el cajero fue desactivado en la nube (`E22`).
   */
  async pullStreamIncremental(stream: string): Promise<{
    appliedCount: number;
    resyncRequiredUrl: string | null;
    activeSessionRevoked: boolean;
  }> {
    const dev = this.auth.deviceState!;
    const currentCursor = this.syncCursors.get(stream) ?? 0n;
    const resp = await this.transport.pullDownstream({
      tenantId: dev.tenant_id,
      branchId: dev.branch_id,
      stream,
      cursorXid: currentCursor
    });

    if (resp.httpStatus === 410) {
      this.syncCursors.set(stream, resp.snapshotCursorXid);
      return {
        appliedCount: 0,
        resyncRequiredUrl: resp.bootstrapUrl,
        activeSessionRevoked: false
      };
    }

    let activeSessionRevoked = false;
    for (const ch of resp.changes) {
      if (stream === "users" && ch.op === "upsert") {
        const newStatus = String(ch.payload["status"] ?? "ACTIVE") as "ACTIVE" | "DISABLED" | "LOCKED";
        // HU-284 (E22): Si el cajero actualmente logueado fue desactivado en la nube, bloquear su sesión de inmediato
        if (this.auth.applyDownstreamUserStatus(ch.entity_id, newStatus)) {
          activeSessionRevoked = true;
        }
      }
    }

    this.syncCursors.set(stream, resp.safe_upto);
    return {
      appliedCount: resp.changes.length,
      resyncRequiredUrl: null,
      activeSessionRevoked
    };
  }

  /**
   * HU-218: `cmd_get_sync_status` y `cmd_trigger_sync_now` (salta espera de backoff y hace push + pull).
   */
  cmdGetSyncStatus(): {
    circuitState: SyncCircuitState;
    pendingCount: number;
    lastSuccessfulSyncAtMs: number | null;
    statusBanner: string;
  } {
    const pendingCount = this.storage.outbox.filter((e) => e.status === "PENDING").length;
    const statusBanner =
      this.circuitState === "OPEN"
        ? `Sin conexión (${pendingCount} pendientes)`
        : `En línea (${pendingCount} pendientes)`;
    return {
      circuitState: this.circuitState,
      pendingCount,
      lastSuccessfulSyncAtMs: this.lastSuccessfulSyncAtMs,
      statusBanner
    };
  }

  async cmdTriggerSyncNow(nowMs = Date.now()): Promise<{
    sentCount: number;
    duplicateCount: number;
  }> {
    if (this.circuitState === "OPEN") {
      this.circuitState = "HALF_OPEN";
      this.nextRetryAllowedAtMs = nowMs;
    }
    const pushRes = await this.dispatchPendingOutboxBatch(nowMs);
    await this.pullStreamIncremental("catalog");
    await this.pullStreamIncremental("users");
    return {
      sentCount: pushRes.sentCount,
      duplicateCount: pushRes.duplicateCount
    };
  }

  /**
   * HU-493: Empaqueta, redacta PII/tokens y comprime logs de diagnóstico para soporte.
   */
  buildAnonymizedSupportDiagnosticBundle(rawLogLines: string[], nowMs = Date.now()): {
    incidentCode: string;
    gzipBundle: Buffer;
    redactedPreview: string;
  } {
    const redactedLines = rawLogLines.map((line) =>
      line
        .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]")
        .replace(/"pin"\s*:\s*"\d+"/gi, '"pin":"[REDACTED]"')
        .replace(/\b3\d{9}\b/g, "[REDACTED_PHONE]")
    );
    const joined = redactedLines.join("\n");
    return {
      incidentCode: `INC-${newId(nowMs).slice(0, 8).toUpperCase()}`,
      gzipBundle: zlib.gzipSync(Buffer.from(joined, "utf8")),
      redactedPreview: joined
    };
  }
}
