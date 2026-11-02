import type { CircuitBreaker } from "@tiendita/service-kit";
import type { SalesService } from "@tiendita/sales-service";
import type { ShortReportCache } from "../cache/report-cache.js";
import type { HttpRequest, HttpResponse } from "../types.js";

export class ReportsController {
  constructor(
    private readonly salesService: SalesService,
    private readonly reportCache: ShortReportCache,
    private readonly getBreaker: (name: string) => CircuitBreaker
  ) {}

  async getDashboard(req: HttpRequest, nowMs: number): Promise<HttpResponse> {
    const claims = req.claims!;
    const safeTenantId = claims.tid!;
    const queryHash = "today";

    const cached = this.reportCache.get(safeTenantId, queryHash, nowMs);
    if (cached) {
      return {
        status: 200,
        headers: { "Content-Type": "application/json", "X-Cache-Lookup": "HIT_REPORT_CACHE" },
        body: cached
      };
    }

    // HU-317: Comprobar breaker de reportes/auditoría para degradación parcial
    const auditBreaker = this.getBreaker("audit-service");
    let auditSummary: { degraded: boolean; message?: string } = { degraded: false };
    try {
      await auditBreaker.execute(
        async () => {
          return true;
        },
        { nowMs }
      );
    } catch {
      auditSummary = { degraded: true, message: "En actualización — Reintentar" };
    }

    const totalSalesCents = [...this.salesService.sales.values()]
      .filter((s) => s.tenant_id === safeTenantId)
      .reduce((sum, s) => sum + s.total_cents, 0);

    const dashboardData = {
      total_sales_cents: totalSalesCents,
      sales_count: [...this.salesService.sales.values()].filter(
        (s) => s.tenant_id === safeTenantId
      ).length,
      audit_widget: auditSummary,
      generated_at_ms: nowMs
    };

    this.reportCache.set(safeTenantId, queryHash, dashboardData, 30, nowMs);
    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: dashboardData
    };
  }

  async invalidateSalesCache(req: HttpRequest): Promise<HttpResponse> {
    const claims = req.claims!;
    this.reportCache.invalidateTenant(claims.tid!);
    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: { invalidated: true }
    };
  }
}
