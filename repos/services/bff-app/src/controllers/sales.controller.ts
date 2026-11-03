import type { SalesService } from "@tiendita/sales-service";
import type { HttpRequest, HttpResponse } from "../types.js";
import { requirePermission } from "../middlewares/gateway-security.js";

export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  async listDigitalPayments(req: HttpRequest, queryParams: URLSearchParams): Promise<HttpResponse> {
    const claims = req.claims!;
    requirePermission(claims, "reports.read");
    const tenantId = claims.tid!;
    const statusFilter = queryParams.get("status");
    const methodFilter = queryParams.get("method");
    const branchFilter = queryParams.get("branchId");

    const results = [...this.salesService.payments.values()]
      .filter((p) => {
        if (p.tenant_id !== tenantId) return false;
        if (p.reconciliation_status === "NOT_APPLICABLE") return false;
        if (statusFilter && p.reconciliation_status !== statusFilter) return false;
        if (methodFilter && p.method !== methodFilter) return false;
        if (branchFilter && p.branch_id !== branchFilter) return false;
        return true;
      })
      .map((p) => {
        const sale = this.salesService.sales.get(p.sale_id);
        return {
          paymentId: p.payment_id,
          saleId: p.sale_id,
          receiptCode: sale?.receipt_code ?? null,
          method: p.method,
          amountCents: p.amount_cents,
          reference: p.reference,
          status: p.reconciliation_status,
          reconciledBy: p.reconciled_by,
          branchId: p.branch_id,
          cashSessionId: p.cash_session_id,
          occurredAtMs: sale?.occurred_at_ms ?? Date.now()
        };
      })
      .sort((a, b) => b.occurredAtMs - a.occurredAtMs);

    const pendingTotalCents = results
      .filter((r) => r.status === "PENDING")
      .reduce((sum, r) => sum + r.amountCents, 0);

    const confirmedTotalCents = results
      .filter((r) => r.status === "CONFIRMED")
      .reduce((sum, r) => sum + r.amountCents, 0);

    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: {
        totalCount: results.length,
        pendingCount: results.filter((r) => r.status === "PENDING").length,
        pendingTotalCents,
        confirmedTotalCents,
        items: results
      }
    };
  }

  async reconcileDigitalPayments(req: HttpRequest): Promise<HttpResponse> {
    const claims = req.claims!;
    requirePermission(claims, "reports.read");
    const { paymentIds, status } = (req.body as any) || {};

    if (!Array.isArray(paymentIds) || paymentIds.length === 0) {
      return {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: { error: "INVALID_PAYMENT_IDS", message: "paymentIds must be a non-empty array" }
      };
    }

    if (status !== "CONFIRMED" && status !== "FAILED") {
      return {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: { error: "INVALID_STATUS", message: "status must be CONFIRMED or FAILED" }
      };
    }

    const reconciled = this.salesService.reconcilePaymentsBatch({
      tenantId: claims.tid!,
      paymentIds,
      status,
      actorId: claims.sub
    });

    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: { reconciledCount: reconciled.length, items: reconciled }
    };
  }
}
