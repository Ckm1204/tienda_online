import type { CircuitBreaker } from "@tiendita/service-kit";
import type { SalesService } from "@tiendita/sales-service";
import type { ReportingService } from "@tiendita/reporting-service";
import type { ShortReportCache } from "../cache/report-cache.js";
import type { HttpRequest, HttpResponse } from "../types.js";

export class ReportsController {
  constructor(
    private readonly salesService: SalesService,
    private readonly reportCache: ShortReportCache,
    private readonly getBreaker: (name: string) => CircuitBreaker,
    private readonly reportingService?: ReportingService
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

  /**
   * Art. 616 E.T.: Consulta consolidada del Libro Fiscal de Operaciones Diarias con indicador UVT.
   */
  async getLibroFiscal(req: HttpRequest, nowMs: number, queryParams?: URLSearchParams): Promise<HttpResponse> {
    const claims = req.claims!;
    const safeTenantId = claims.tid!;
    const yearMonth = queryParams?.get("yearMonth") ?? new Date(nowMs).toISOString().slice(0, 7);

    if (!this.reportingService) {
      return {
        status: 501,
        headers: { "Content-Type": "application/json" },
        body: { error: "REPORTING_SERVICE_UNAVAILABLE" }
      };
    }

    const report = this.reportingService.generateLibroFiscalDiario(safeTenantId, yearMonth);

    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: report
    };
  }

  /**
   * Art. 616 E.T.: Exportación del Libro Fiscal en formato CSV tabular para requerimientos DIAN.
   */
  async getLibroFiscalCsv(req: HttpRequest, nowMs: number, queryParams?: URLSearchParams): Promise<HttpResponse> {
    const claims = req.claims!;
    const safeTenantId = claims.tid!;
    const yearMonth = queryParams?.get("yearMonth") ?? new Date(nowMs).toISOString().slice(0, 7);

    if (!this.reportingService) {
      return {
        status: 501,
        headers: { "Content-Type": "application/json" },
        body: { error: "REPORTING_SERVICE_UNAVAILABLE" }
      };
    }

    const { filename, csv } = this.reportingService.exportLibroFiscalCsv(safeTenantId, yearMonth);

    return {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`
      },
      body: csv
    };
  }

  /**
   * Art. 616 E.T.: Exportación del comprobante de cierre fiscal en formato tiquete térmico 80 mm.
   */
  async getLibroFiscalThermal(req: HttpRequest, nowMs: number, queryParams?: URLSearchParams): Promise<HttpResponse> {
    const claims = req.claims!;
    const safeTenantId = claims.tid!;
    const yearMonth = queryParams?.get("yearMonth") ?? new Date(nowMs).toISOString().slice(0, 7);

    if (!this.reportingService) {
      return {
        status: 501,
        headers: { "Content-Type": "application/json" },
        body: { error: "REPORTING_SERVICE_UNAVAILABLE" }
      };
    }

    const thermalContent = this.reportingService.exportLibroFiscalThermalReceipt(safeTenantId, yearMonth);

    return {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
      body: thermalContent
    };
  }

  /**
   * HU-107, HU-484: Exportación de asientos contables estructurados para Siigo, World Office o Alegra.
   */
  async getAccountingExport(req: HttpRequest, nowMs: number, queryParams?: URLSearchParams): Promise<HttpResponse> {
    const claims = req.claims!;
    const safeTenantId = claims.tid!;
    const nowIsoDay = new Date(nowMs).toISOString().slice(0, 10);
    const fromDay = queryParams?.get("from") ?? nowIsoDay;
    const toDay = queryParams?.get("to") ?? nowIsoDay;
    const rawSoftware = (queryParams?.get("software") ?? "SIIGO").toUpperCase();
    const software: "SIIGO" | "WORLD_OFFICE" | "ALEGRA" =
      rawSoftware === "WORLD_OFFICE" || rawSoftware === "ALEGRA" ? rawSoftware : "SIIGO";

    if (!this.reportingService) {
      return {
        status: 501,
        headers: { "Content-Type": "application/json" },
        body: { error: "REPORTING_SERVICE_UNAVAILABLE" }
      };
    }

    const exportResult = this.reportingService.generateAccountingExport(safeTenantId, fromDay, toDay, software);

    // Formatear filas a CSV estándar
    const headers = [
      "fecha",
      "cuenta_ingreso",
      "comprobante",
      "base_gravable_cents",
      "iva_cents",
      "total_cents",
      "efectivo_cents",
      "bancos_digitales_cents"
    ];
    const csvLines = [
      headers.join(","),
      ...exportResult.rows.map((r: any) =>
        [
          r.fecha,
          r.cuenta_ingreso,
          r.comprobante,
          r.base_gravable_cents,
          r.iva_cents,
          r.total_cents,
          r.efectivo_cents,
          r.bancos_digitales_cents
        ].join(",")
      )
    ];

    return {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${exportResult.filename}"`
      },
      body: csvLines.join("\n")
    };
  }
}
