import zlib from "node:zlib";
import { canonicalSha256, newId } from "@tiendita/contracts";

/**
 * ÉPICA 07 (FT-07.2 & FT-07.3) — sync-service en Nube
 * Cubre: HU-065..HU-071, HU-184..HU-187, HU-196, HU-259, HU-279, HU-283, HU-300, HU-335, HU-370, HU-404, HU-504.
 */

export interface IngestedEventRecord {
  event_id: string;
  tenant_id: string;
  branch_id: string;
  terminal_id: string;
  terminal_seq: number;
  event_type: string;
  schema_version: number;
  payload: Record<string, unknown>;
  payload_hash: string;
  occurred_at: string;
  received_at_ms: number;
  clock_skew_ms: number;
  hlc: string;
}

export interface QuarantineRecord {
  id: string;
  tenant_id: string;
  terminal_id: string;
  event_id: string;
  event_type: string;
  reason_code: string;
  details: string;
  payload: Record<string, unknown>;
  status: "OPEN" | "RESOLVED" | "DISCARDED";
  resolved_by: string | null;
  resolution_note: string | null;
  created_at_ms: number;
  resolved_at_ms: number | null;
}

export interface DownstreamChangeRow {
  tenant_id: string;
  branch_id: string | null; // null = todas las sucursales del tenant
  stream: string;
  entity_id: string;
  op: "upsert" | "delete";
  payload: Record<string, unknown>;
  source_version: number;
  row_xid: bigint;
}

/**
 * HU-184: Descompresión segura de gzip abortando inmediatamente si supera maxUncompressedBytes (por defecto 5 MB).
 */
export function safeGunzipWithLimit(
  compressed: Buffer,
  maxUncompressedBytes = 5 * 1024 * 1024
): Buffer {
  return zlib.gunzipSync(compressed, {
    maxOutputLength: maxUncompressedBytes
  });
}

function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da - db;
  }
  return 0;
}

export class CloudSyncService {
  public minSupportedAppVersion = "1.2.0";
  public minRetainedXid = 1n;
  private currentXid = 100n;
  private readonly openTransactionXids = new Set<bigint>();

  public readonly eventIds = new Map<string, { payload_hash: string; terminal_id: string }>();
  public readonly ingestedEvents: IngestedEventRecord[] = [];
  public readonly kafkaPublishedPosEvents: IngestedEventRecord[] = [];
  public readonly terminalLastSeq = new Map<string, number>();
  public readonly securityAlerts: { code: string; terminal_id: string; event_id?: string; details: string }[] = [];
  public readonly quarantine = new Map<string, QuarantineRecord>();
  public readonly downstreamChanges = new Map<string, DownstreamChangeRow>();

  public readonly pendingPullNowByBranch = new Map<string, Set<string>>();
  public readonly terminalHeartbeats = new Map<
    string,
    {
      tenant_id: string;
      terminal_id: string;
      last_heartbeat_ms: number;
      pending_outbox_count: number;
      oldest_pending_at_ms: number | null;
    }
  >();

  allocateXid(keepOpen = false): bigint {
    const xid = this.currentXid++;
    if (keepOpen) {
      this.openTransactionXids.add(xid);
    }
    return xid;
  }

  commitOpenXid(xid: bigint): void {
    this.openTransactionXids.delete(xid);
  }

  /**
   * Equivalente exacto de `pg_snapshot_xmin(pg_current_snapshot())`:
   * el menor `xid8` aún abierto o `this.currentXid` si no hay transacciones abiertas.
   */
  getSnapshotXmin(): bigint {
    if (this.openTransactionXids.size === 0) {
      return this.currentXid;
    }
    let min = this.currentXid;
    for (const x of this.openTransactionXids) {
      if (x < min) min = x;
    }
    return min;
  }

  /**
   * HU-065, HU-066, HU-184, HU-185, HU-186, HU-279 & HU-283:
   * Procesa un lote `POST /v1/sync/push` comprimido con `gzip`.
   */
  handlePushGzipBatch(params: {
    tenantId: string;
    branchId: string;
    terminalId: string;
    appVersion: string;
    gzipBody: Buffer;
    batchSignature: string;
    declaredLossReason?: string;
    nowMs?: number;
  }):
    | {
        httpStatus: 200;
        results: {
          event_id: string;
          terminal_seq: number;
          status: "ACCEPTED" | "DUPLICATE" | "CONFLICT" | "QUARANTINED";
        }[];
      }
    | { httpStatus: 409; code: "GAP_DETECTED"; expected_seq: number }
    | { httpStatus: 413; code: "PAYLOAD_TOO_LARGE" }
    | { httpStatus: 426; code: "UPGRADE_REQUIRED"; min_version: string } {
    const nowMs = params.nowMs ?? Date.now();

    // HU-186: Verificar versión mínima de protocolo
    if (compareSemver(params.appVersion, this.minSupportedAppVersion) < 0) {
      return {
        httpStatus: 426,
        code: "UPGRADE_REQUIRED",
        min_version: this.minSupportedAppVersion
      };
    }

    // HU-184: Descompresión con límite de 5 MB contra gzip bombs
    let rawBuf: Buffer;
    try {
      rawBuf = safeGunzipWithLimit(params.gzipBody, 5 * 1024 * 1024);
    } catch {
      return { httpStatus: 413, code: "PAYLOAD_TOO_LARGE" };
    }

    const body = JSON.parse(rawBuf.toString("utf8")) as {
      tenant_id: string;
      branch_id: string;
      terminal_id: string;
      events: {
        event_id: string;
        terminal_seq: number;
        event_type: string;
        schema_version: number;
        payload: Record<string, unknown>;
        payload_hash: string;
        occurred_at: string;
        hlc: string;
      }[];
    };

    const sortedEvents = [...body.events].sort((a, b) => a.terminal_seq - b.terminal_seq);
    const results: {
      event_id: string;
      terminal_seq: number;
      status: "ACCEPTED" | "DUPLICATE" | "CONFLICT" | "QUARANTINED";
    }[] = [];

    for (const ev of sortedEvents) {
      // 1. Verificar si el event_id ya fue procesado antes (HU-065 & HU-279)
      const prev = this.eventIds.get(ev.event_id);
      if (prev) {
        if (prev.payload_hash === ev.payload_hash) {
          results.push({
            event_id: ev.event_id,
            terminal_seq: ev.terminal_seq,
            status: "DUPLICATE"
          });
          continue;
        } else {
          // HU-065 (E18): Mismo event_id con distinto payload_hash -> alerta crítica de seguridad
          this.securityAlerts.push({
            code: "EVENT_HASH_CONFLICT",
            terminal_id: params.terminalId,
            event_id: ev.event_id,
            details: `Expected ${prev.payload_hash}, got ${ev.payload_hash}`
          });
          results.push({
            event_id: ev.event_id,
            terminal_seq: ev.terminal_seq,
            status: "CONFLICT"
          });
          continue;
        }
      }

      // 2. Verificar secuencia contigua terminal_seq (HU-066 & HU-283)
      const lastSeq = this.terminalLastSeq.get(params.terminalId);
      if (lastSeq !== undefined && ev.terminal_seq > lastSeq + 1) {
        if (params.declaredLossReason) {
          this.securityAlerts.push({
            code: "DECLARED_SEQ_LOSS_JUMP",
            terminal_id: params.terminalId,
            details: `Gap ${lastSeq + 1}..${ev.terminal_seq - 1}: ${params.declaredLossReason}`
          });
          this.terminalLastSeq.set(params.terminalId, ev.terminal_seq - 1);
        } else {
          return {
            httpStatus: 409,
            code: "GAP_DETECTED",
            expected_seq: lastSeq + 1
          };
        }
      }

      // 3. Calcular clock_skew_ms (HU-185) y persistir de forma atómica
      const occurredMs = Date.parse(ev.occurred_at);
      const clockSkewMs = Number.isNaN(occurredMs) ? 0 : nowMs - occurredMs;

      const record: IngestedEventRecord = {
        event_id: ev.event_id,
        tenant_id: params.tenantId,
        branch_id: params.branchId,
        terminal_id: params.terminalId,
        terminal_seq: ev.terminal_seq,
        event_type: ev.event_type,
        schema_version: ev.schema_version,
        payload: ev.payload,
        payload_hash: ev.payload_hash,
        occurred_at: ev.occurred_at,
        received_at_ms: nowMs,
        clock_skew_ms: clockSkewMs,
        hlc: ev.hlc
      };

      this.eventIds.set(ev.event_id, {
        payload_hash: ev.payload_hash,
        terminal_id: params.terminalId
      });
      this.ingestedEvents.push(record);
      this.kafkaPublishedPosEvents.push(record);
      this.terminalLastSeq.set(
        params.terminalId,
        Math.max(lastSeq ?? 0, ev.terminal_seq)
      );

      results.push({
        event_id: ev.event_id,
        terminal_seq: ev.terminal_seq,
        status: "ACCEPTED"
      });
    }

    return {
      httpStatus: 200,
      results
    };
  }

  /**
   * HU-067 & HU-404: Registro, consulta y resolución de eventos en cuarentena (`sync_quarantine`).
   */
  quarantineEvent(params: {
    tenantId: string;
    terminalId: string;
    eventId: string;
    eventType: string;
    reasonCode: string;
    details: string;
    payload: Record<string, unknown>;
    nowMs?: number;
  }): QuarantineRecord {
    const nowMs = params.nowMs ?? Date.now();
    const rec: QuarantineRecord = {
      id: newId(nowMs),
      tenant_id: params.tenantId,
      terminal_id: params.terminalId,
      event_id: params.eventId,
      event_type: params.eventType,
      reason_code: params.reasonCode,
      details: params.details,
      payload: params.payload,
      status: "OPEN",
      resolved_by: null,
      resolution_note: null,
      created_at_ms: nowMs,
      resolved_at_ms: null
    };
    this.quarantine.set(rec.id, rec);
    return rec;
  }

  listQuarantine(tenantId: string): QuarantineRecord[] {
    return [...this.quarantine.values()].filter((q) => q.tenant_id === tenantId);
  }

  resolveQuarantine(params: {
    quarantineId: string;
    action: "RESOLVED" | "DISCARDED";
    resolvedBy: string;
    note: string;
    nowMs?: number;
  }): QuarantineRecord {
    const q = this.quarantine.get(params.quarantineId);
    if (!q) throw new Error("QUARANTINE_NOT_FOUND");
    q.status = params.action;
    q.resolved_by = params.resolvedBy;
    q.resolution_note = params.note;
    q.resolved_at_ms = params.nowMs ?? Date.now();
    return q;
  }

  /**
   * HU-370: Herramienta de replay de eventos históricos desde `ingested_events` en orden de `terminal_seq`.
   */
  replayIngestedEventsForTenant(tenantId: string): IngestedEventRecord[] {
    return this.ingestedEvents
      .filter((e) => e.tenant_id === tenantId)
      .sort((a, b) => a.terminal_seq - b.terminal_seq);
  }

  /**
   * HU-068 & HU-300: Proyección hacia `downstream_changes` con protección contra desorden
   * (`source_version > existing.source_version`) y filtrado por sucursal (`branch_id`).
   */
  projectDownstreamChange(params: {
    tenantId: string;
    branchId?: string | null;
    stream: string;
    entityId: string;
    op: "upsert" | "delete";
    payload: Record<string, unknown>;
    sourceVersion: number;
    explicitXid?: bigint;
  }): boolean {
    const key = `${params.tenantId}:${params.branchId ?? "*"}:${params.stream}:${params.entityId}`;
    const existing = this.downstreamChanges.get(key);
    // HU-068 (E32): Descartar evento viejo que llega fuera de orden
    if (existing && params.sourceVersion <= existing.source_version) {
      return false;
    }

    const rowXid = params.explicitXid ?? this.allocateXid(false);
    this.downstreamChanges.set(key, {
      tenant_id: params.tenantId,
      branch_id: params.branchId ?? null,
      stream: params.stream,
      entity_id: params.entityId,
      op: params.op,
      payload: params.payload,
      source_version: params.sourceVersion,
      row_xid: rowXid
    });

    const branchKey = `${params.tenantId}:${params.branchId ?? "*"}`;
    const set = this.pendingPullNowByBranch.get(branchKey) ?? new Set<string>();
    set.add(params.stream);
    this.pendingPullNowByBranch.set(branchKey, set);
    return true;
  }

  /**
   * HU-069, HU-070 & HU-187: `GET /v1/sync/pull` con cursor transaccional `xid8` y `pg_snapshot_xmin`,
   * o `410 RESYNC_REQUIRED` si el cursor fue purgado.
   */
  handlePullDownstream(params: {
    tenantId: string;
    branchId: string;
    stream: string;
    cursorXid: bigint;
  }):
    | {
        httpStatus: 200;
        safe_upto: bigint;
        changes: DownstreamChangeRow[];
      }
    | {
        httpStatus: 410;
        code: "RESYNC_REQUIRED";
        bootstrapUrl: string;
        snapshotCursorXid: bigint;
      } {
    if (params.cursorXid > 0n && params.cursorXid < this.minRetainedXid) {
      const snap = this.generateBootstrapSnapshot(params.tenantId, params.branchId);
      return {
        httpStatus: 410,
        code: "RESYNC_REQUIRED",
        bootstrapUrl: snap.presignedUrl,
        snapshotCursorXid: snap.cursorXid
      };
    }

    const safeUpto = this.getSnapshotXmin();
    const changes = [...this.downstreamChanges.values()]
      .filter(
        (r) =>
          r.tenant_id === params.tenantId &&
          r.stream === params.stream &&
          (r.branch_id === null || r.branch_id === params.branchId) &&
          r.row_xid >= params.cursorXid &&
          r.row_xid < safeUpto &&
          !this.openTransactionXids.has(r.row_xid)
      )
      .sort((a, b) => (a.row_xid < b.row_xid ? -1 : a.row_xid > b.row_xid ? 1 : 0));

    return {
      httpStatus: 200,
      safe_upto: safeUpto,
      changes
    };
  }

  /**
   * HU-070 & HU-187: Generador de snapshots de Bootstrap por tienda/sucursal con cursor `xid8` exacto.
   */
  generateBootstrapSnapshot(tenantId: string, branchId: string): {
    presignedUrl: string;
    cursorXid: bigint;
    jsonlGzip: Buffer;
    rowCount: number;
  } {
    const safeUpto = this.getSnapshotXmin();
    const rows = [...this.downstreamChanges.values()].filter(
      (r) =>
        r.tenant_id === tenantId &&
        (r.branch_id === null || r.branch_id === branchId) &&
        r.row_xid < safeUpto &&
        !this.openTransactionXids.has(r.row_xid)
    );
    const jsonl = rows
      .map((r) =>
        JSON.stringify({
          stream: r.stream,
          entity_id: r.entity_id,
          op: r.op,
          payload: r.payload,
          source_version: r.source_version,
          row_xid: r.row_xid.toString()
        })
      )
      .join("\n");

    return {
      presignedUrl: `https://s3.tiendita.local/bootstrap/${tenantId}/${branchId}/snap-${safeUpto.toString()}.jsonl.gz?expires=600`,
      cursorXid: safeUpto,
      jsonlGzip: zlib.gzipSync(Buffer.from(jsonl, "utf8")),
      rowCount: rows.length
    };
  }

  /**
   * HU-071 & HU-185: `POST /v1/terminals/heartbeat` con detección de desfase de reloj (> 15 min) y banderas `pull_now`.
   */
  handleHeartbeat(params: {
    tenantId: string;
    branchId: string;
    terminalId: string;
    localTimeMs: number;
    pendingOutboxCount: number;
    oldestPendingAtMs: number | null;
    serverNowMs?: number;
  }): {
    serverTimeMs: number;
    clockSkewWarning: string | null;
    flags: { pull_now: string[] };
  } {
    const serverNowMs = params.serverNowMs ?? Date.now();
    this.terminalHeartbeats.set(params.terminalId, {
      tenant_id: params.tenantId,
      terminal_id: params.terminalId,
      last_heartbeat_ms: serverNowMs,
      pending_outbox_count: params.pendingOutboxCount,
      oldest_pending_at_ms: params.oldestPendingAtMs
    });

    const skewMs = Math.abs(params.localTimeMs - serverNowMs);
    const clockSkewWarning =
      skewMs > 15 * 60 * 1000
        ? `El reloj del PC tiene un desfase de ${Math.round(skewMs / 60000)} minutos respecto a la nube.`
        : null;

    const globalStreams = this.pendingPullNowByBranch.get(`${params.tenantId}:*`) ?? new Set<string>();
    const branchStreams = this.pendingPullNowByBranch.get(`${params.tenantId}:${params.branchId}`) ?? new Set<string>();
    const pullNow = [...new Set([...globalStreams, ...branchStreams])];

    return {
      serverTimeMs: serverNowMs,
      clockSkewWarning,
      flags: { pull_now: pullNow }
    };
  }

  /**
   * HU-196: Detector de cajas silenciosas (`terminal.stale`) o con ventas represadas de más de 24 horas.
   */
  detectStaleTerminals(nowMs = Date.now(), maxHeartbeatSilenceHours = 4): {
    terminal_id: string;
    tenant_id: string;
    reason: "NO_HEARTBEAT" | "OLD_PENDING_OUTBOX";
  }[] {
    const alerts: {
      terminal_id: string;
      tenant_id: string;
      reason: "NO_HEARTBEAT" | "OLD_PENDING_OUTBOX";
    }[] = [];

    for (const hb of this.terminalHeartbeats.values()) {
      if (nowMs - hb.last_heartbeat_ms > maxHeartbeatSilenceHours * 3_600_000) {
        alerts.push({
          terminal_id: hb.terminal_id,
          tenant_id: hb.tenant_id,
          reason: "NO_HEARTBEAT"
        });
      } else if (
        hb.oldest_pending_at_ms !== null &&
        nowMs - hb.oldest_pending_at_ms > 24 * 3_600_000
      ) {
        alerts.push({
          terminal_id: hb.terminal_id,
          tenant_id: hb.tenant_id,
          reason: "OLD_PENDING_OUTBOX"
        });
      }
    }
    return alerts;
  }
}
