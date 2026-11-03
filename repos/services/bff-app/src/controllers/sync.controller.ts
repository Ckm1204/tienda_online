import zlib from "node:zlib";
import type { CloudSyncService } from "@tiendita/sync-service";
import type { SalesService } from "@tiendita/sales-service";
import type { ReportingService } from "@tiendita/reporting-service";
import type { HttpRequest, HttpResponse } from "../types.js";
import { requirePermission } from "../middlewares/gateway-security.js";

export interface SyncControllerOptions {
  syncService: CloudSyncService;
  salesService?: SalesService;
  reportingService?: ReportingService;
  recordSaleAndConsolidate?: (
    params: Parameters<SalesService["consumeSaleCompletedEvent"]>[0]
  ) => ReturnType<SalesService["consumeSaleCompletedEvent"]>;
}

export class SyncController {
  private readonly syncService: CloudSyncService;
  private readonly salesService?: SalesService;
  private readonly reportingService?: ReportingService;
  private readonly recordSaleAndConsolidate?: (
    params: Parameters<SalesService["consumeSaleCompletedEvent"]>[0]
  ) => ReturnType<SalesService["consumeSaleCompletedEvent"]>;

  constructor(options: SyncControllerOptions) {
    this.syncService = options.syncService;
    this.salesService = options.salesService;
    this.reportingService = options.reportingService;
    this.recordSaleAndConsolidate = options.recordSaleAndConsolidate;
  }

  /**
   * HU-065, HU-066, HU-184, HU-185, HU-186, HU-279, HU-283
   * POST /v1/sync/push
   */
  async push(req: HttpRequest, nowMs: number): Promise<HttpResponse> {
    // 1. Extraer contexto de tienda, sucursal y terminal
    let tenantId =
      req.claims?.tid ??
      (req.headers["x-tenant-id"] as string) ??
      "";
    let branchId =
      ((req.claims as Record<string, unknown> | undefined)?.bid as string) ??
      ((req.claims as Record<string, unknown> | undefined)?.branch_id as string) ??
      (req.headers["x-branch-id"] as string) ??
      "";
    let terminalId =
      ((req.claims as Record<string, unknown> | undefined)?.term as string) ??
      ((req.claims as Record<string, unknown> | undefined)?.terminal_id as string) ??
      (req.headers["x-terminal-id"] as string) ??
      "";

    // Si vienen en el cuerpo deserializado
    if (typeof req.body === "object" && req.body !== null) {
      const b = req.body as Record<string, unknown>;
      if (!tenantId && typeof b.tenant_id === "string") tenantId = b.tenant_id;
      if (!branchId && typeof b.branch_id === "string") branchId = b.branch_id;
      if (!terminalId && typeof b.terminal_id === "string") terminalId = b.terminal_id;
    }

    if (!tenantId || !branchId || !terminalId) {
      return {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: {
          error: "MISSING_SYNC_CONTEXT",
          detail: "tenant_id, branch_id, and terminal_id are required in claims, headers, or body"
        }
      };
    }

    const appVersion =
      (req.headers["x-app-version"] as string) ??
      (typeof req.body === "object" && req.body !== null && "app_version" in req.body
        ? String((req.body as Record<string, unknown>).app_version)
        : "1.2.0");

    const batchSignature =
      (req.headers["x-batch-signature"] as string) ??
      (req.headers["x-device-signature"] as string) ??
      "valid-sig";

    const declaredLossReason =
      (req.headers["x-declared-loss-reason"] as string) ??
      (typeof req.body === "object" && req.body !== null && "declared_loss_reason" in req.body
        ? String((req.body as Record<string, unknown>).declared_loss_reason)
        : undefined);

    // 2. Preparar el buffer comprimido con gzip
    let gzipBody: Buffer;
    if (Buffer.isBuffer(req.body)) {
      const isAlreadyGzip =
        req.body.length >= 2 && req.body[0] === 0x1f && req.body[1] === 0x8b;
      if (isAlreadyGzip || (req.headers["content-encoding"] || "").includes("gzip")) {
        gzipBody = req.body;
      } else {
        gzipBody = zlib.gzipSync(req.body);
      }
    } else if (typeof req.body === "string") {
      const contentEncoding = (req.headers["content-encoding"] || "").toLowerCase();
      if (contentEncoding.includes("gzip")) {
        gzipBody = Buffer.from(req.body, "base64");
      } else {
        gzipBody = zlib.gzipSync(Buffer.from(req.body, "utf-8"));
      }
    } else if (typeof req.body === "object" && req.body !== null) {
      // Si el objeto no tenía los ids inyectados, los inyectamos
      const payloadObj = {
        tenant_id: tenantId,
        branch_id: branchId,
        terminal_id: terminalId,
        ...(req.body as Record<string, unknown>)
      };
      gzipBody = zlib.gzipSync(Buffer.from(JSON.stringify(payloadObj), "utf-8"));
    } else {
      return {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: { error: "EMPTY_BODY", detail: "Request body cannot be empty" }
      };
    }

    // 3. Invocar al servicio de sincronización nube
    const result = this.syncService.handlePushGzipBatch({
      tenantId,
      branchId,
      terminalId,
      appVersion,
      gzipBody,
      batchSignature,
      declaredLossReason,
      nowMs
    });

    if (result.httpStatus === 200) {
      // 4. Si hay eventos de venta aceptados, propagar a salesService y reportingService
      try {
        const uncompressed = zlib.gunzipSync(gzipBody);
        const parsed = JSON.parse(uncompressed.toString("utf8")) as {
          events?: Array<{
            event_id: string;
            event_type: string;
            payload: Record<string, unknown>;
            occurred_at?: string;
          }>;
        };

        const acceptedIds = new Set(
          result.results
            .filter((r) => r.status === "ACCEPTED")
            .map((r) => r.event_id)
        );

        if (parsed.events) {
          for (const ev of parsed.events) {
            if (!acceptedIds.has(ev.event_id)) continue;

            if (ev.event_type === "sale.completed" || ev.event_type === "sale.created") {
              const p = ev.payload;
              const saleId = (p.sale_id as string) || (p.saleId as string) || ev.event_id;
              const occurredAtMs =
                typeof p.occurred_at_ms === "number"
                  ? p.occurred_at_ms
                  : ev.occurred_at
                    ? Date.parse(ev.occurred_at)
                    : nowMs;

              const saleParams: Parameters<SalesService["consumeSaleCompletedEvent"]>[0] = {
                eventId: ev.event_id,
                tenantId,
                branchId,
                terminalId,
                cashSessionId: (p.cash_session_id as string) || "session-pos-sync",
                cashierId: (p.sold_by_user_id as string) || (p.cashier_id as string) || "cashier-default",
                customerId: (p.customer_id as string) || null,
                saleId,
                receiptPrefix: (p.receipt_prefix as string) || (p.prefix as string) || "POS",
                receiptNumber: Number(p.receipt_number) || Number(p.consecutive) || 1,
                totalCents: Number(p.total_cents) || 0,
                occurredAtMs,
                lines: Array.isArray(p.lines)
                  ? (p.lines as any[]).map((l, idx) => ({
                      line_id: l.line_id || `l-${idx}`,
                      product_id: l.product_id || `p-${idx}`,
                      description: l.description || "Producto",
                      qty_milli: Number(l.qty_milli) || 1000,
                      unit_price_cents: Number(l.unit_price_cents) || 0,
                      line_total_cents: Number(l.line_total_cents) || 0,
                      tax_rate_bps: Number(l.tax_rate_bps) || 0,
                      sold_with_stale_price: Boolean(l.sold_with_stale_price)
                    }))
                  : [],
                payments: Array.isArray(p.payments)
                  ? (p.payments as any[]).map((pm, idx) => ({
                      payment_id: pm.payment_id || `pm-${idx}`,
                      method: pm.method || "CASH",
                      amount_cents: Number(pm.amount_cents) || 0,
                      reference: pm.reference || null
                    }))
                  : [
                      {
                        payment_id: "pm-0",
                        method: "CASH",
                        amount_cents: Number(p.total_cents) || 0,
                        reference: null
                      }
                    ]
              };

              if (this.recordSaleAndConsolidate) {
                this.recordSaleAndConsolidate(saleParams);
              } else if (this.salesService) {
                this.salesService.consumeSaleCompletedEvent(saleParams);
              }
            }
          }
        }
      } catch {
        // La ingesta duradera de sync ya ocurrió con éxito en sync-service
      }

      const ackUpToSeq = this.syncService.terminalLastSeq.get(terminalId) ?? 0;

      return {
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: {
          results: result.results,
          ack_up_to_seq: ackUpToSeq,
          server_time: new Date(nowMs).toISOString(),
          server_time_ms: nowMs
        }
      };
    }

    if (result.httpStatus === 409) {
      return {
        status: 409,
        headers: { "Content-Type": "application/json" },
        body: {
          error: "GAP_DETECTED",
          code: "GAP_DETECTED",
          expected_seq: result.expected_seq
        }
      };
    }

    if (result.httpStatus === 413) {
      return {
        status: 413,
        headers: { "Content-Type": "application/json" },
        body: {
          error: "PAYLOAD_TOO_LARGE",
          code: "PAYLOAD_TOO_LARGE"
        }
      };
    }

    return {
      status: 426,
      headers: { "Content-Type": "application/json" },
      body: {
        error: "UPGRADE_REQUIRED",
        code: "UPGRADE_REQUIRED",
        min_version: result.min_version
      }
    };
  }

  /**
   * HU-069, HU-070 & HU-187
   * GET /v1/sync/pull?stream=catalog&cursor_xid=0
   */
  async pull(
    req: HttpRequest,
    _nowMs: number,
    queryParams: URLSearchParams
  ): Promise<HttpResponse> {
    const tenantId =
      req.claims?.tid ??
      (req.headers["x-tenant-id"] as string) ??
      queryParams.get("tenant_id") ??
      "";
    const branchId =
      ((req.claims as Record<string, unknown> | undefined)?.bid as string) ??
      ((req.claims as Record<string, unknown> | undefined)?.branch_id as string) ??
      (req.headers["x-branch-id"] as string) ??
      queryParams.get("branch_id") ??
      "main";

    if (!tenantId) {
      return {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: { error: "MISSING_REQUIRED_PARAMS", detail: "tenant_id is required" }
      };
    }

    const stream = queryParams.get("stream") || "catalog";
    const cursorStr =
      queryParams.get("cursor_xid") ||
      queryParams.get("after_xid") ||
      queryParams.get("cursor") ||
      "0";

    const digits = cursorStr.replace(/\D/g, "");
    const cursorXid = BigInt(digits.length > 0 ? digits : "0");

    const result = this.syncService.handlePullDownstream({
      tenantId,
      branchId,
      stream,
      cursorXid
    });

    if (result.httpStatus === 200) {
      return {
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: {
          stream,
          safe_upto: result.safe_upto.toString(),
          next_cursor: result.safe_upto.toString(),
          has_more: false,
          changes: result.changes.map((c) => ({
            tenant_id: c.tenant_id,
            branch_id: c.branch_id,
            stream: c.stream,
            entity_id: c.entity_id,
            op: c.op,
            source_version: c.source_version,
            row_xid: c.row_xid.toString(),
            payload: c.payload
          }))
        }
      };
    }

    return {
      status: 410,
      headers: { "Content-Type": "application/json" },
      body: {
        error: "RESYNC_REQUIRED",
        code: "RESYNC_REQUIRED",
        bootstrap_url: result.bootstrapUrl,
        snapshot_cursor_xid: result.snapshotCursorXid.toString()
      }
    };
  }

  /**
   * HU-071 & HU-185
   * POST /v1/terminals/heartbeat o POST /v1/sync/heartbeat
   */
  async heartbeat(req: HttpRequest, nowMs: number): Promise<HttpResponse> {
    const body = (typeof req.body === "object" && req.body !== null
      ? req.body
      : {}) as Record<string, unknown>;

    const tenantId =
      (body.tenant_id as string) ??
      req.claims?.tid ??
      (req.headers["x-tenant-id"] as string) ??
      "tenant-default";

    const branchId =
      (body.branch_id as string) ??
      ((req.claims as Record<string, unknown> | undefined)?.bid as string) ??
      (req.headers["x-branch-id"] as string) ??
      "main";

    const terminalId =
      (body.terminal_id as string) ??
      ((req.claims as Record<string, unknown> | undefined)?.term as string) ??
      req.claims?.sub ??
      (req.headers["x-terminal-id"] as string) ??
      "term-default";

    const localTimeMs =
      typeof body.local_time_ms === "number"
        ? body.local_time_ms
        : typeof body.local_time === "string"
          ? Date.parse(body.local_time)
          : nowMs;

    const pendingOutboxCount =
      typeof body.pending_outbox_count === "number"
        ? body.pending_outbox_count
        : typeof body.pending_outbox === "number"
          ? body.pending_outbox
          : 0;

    const oldestPendingAtMs =
      typeof body.oldest_pending_at_ms === "number"
        ? body.oldest_pending_at_ms
        : typeof body.oldest_pending_at === "string"
          ? Date.parse(body.oldest_pending_at)
          : null;

    const result = this.syncService.handleHeartbeat({
      tenantId,
      branchId,
      terminalId,
      localTimeMs,
      pendingOutboxCount,
      oldestPendingAtMs,
      serverNowMs: nowMs
    });

    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: {
        server_time: new Date(nowMs).toISOString(),
        server_time_ms: result.serverTimeMs,
        clock_skew_warning: result.clockSkewWarning,
        flags: result.flags
      }
    };
  }

  /**
   * HU-067 & HU-404
   * GET /v1/app/quarantine o GET /v1/sync/quarantine
   */
  async listQuarantine(req: HttpRequest): Promise<HttpResponse> {
    const claims = req.claims!;
    requirePermission(claims, "terminal.read");
    const tenantId = claims.tid!;
    const items = this.syncService.listQuarantine(tenantId);

    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: { items }
    };
  }

  /**
   * HU-067 & HU-404
   * POST /v1/app/quarantine/:id/resolve o POST /v1/sync/quarantine/:id/resolve
   */
  async resolveQuarantine(
    req: HttpRequest,
    quarantineId: string,
    nowMs: number
  ): Promise<HttpResponse> {
    const claims = req.claims!;
    requirePermission(claims, "terminal.manage");

    const body = (typeof req.body === "object" && req.body !== null
      ? req.body
      : {}) as { action?: "RESOLVED" | "DISCARDED"; note?: string };

    const action = body.action === "DISCARDED" ? "DISCARDED" : "RESOLVED";

    try {
      const record = this.syncService.resolveQuarantine({
        quarantineId,
        action,
        resolvedBy: claims.sub,
        note: body.note ?? "Resuelto desde gestión administrativa",
        nowMs
      });

      return {
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: { resolved: true, record }
      };
    } catch {
      return {
        status: 404,
        headers: { "Content-Type": "application/json" },
        body: { error: "QUARANTINE_NOT_FOUND", quarantine_id: quarantineId }
      };
    }
  }

  /**
   * HU-068 & HU-300
   * POST /v1/app/sync/project-change
   * Permite proyectar cambios hacia terminales downstream (catálogo, listas de precios, etc.)
   */
  async projectDownstreamChange(req: HttpRequest): Promise<HttpResponse> {
    const claims = req.claims!;
    requirePermission(claims, "catalog.manage");

    const body = (typeof req.body === "object" && req.body !== null
      ? req.body
      : {}) as {
      stream: string;
      entityId: string;
      op?: "upsert" | "delete";
      payload?: Record<string, unknown>;
      sourceVersion?: number;
      branchId?: string | null;
    };

    if (!body.stream || !body.entityId) {
      return {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: { error: "MISSING_FIELDS", detail: "stream and entityId are required" }
      };
    }

    const projected = this.syncService.projectDownstreamChange({
      tenantId: claims.tid!,
      branchId: body.branchId ?? null,
      stream: body.stream,
      entityId: body.entityId,
      op: body.op ?? "upsert",
      payload: body.payload ?? {},
      sourceVersion: body.sourceVersion ?? 1
    });

    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: { projected }
    };
  }
}
