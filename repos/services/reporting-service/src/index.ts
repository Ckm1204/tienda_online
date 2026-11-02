import { newId } from "@tiendita/contracts";
import { ServiceLifecycleManager, OutboxStore, InboxConsumerRunner } from "@tiendita/service-kit";

export const serviceName = "reporting-service";
export const lifecycle = new ServiceLifecycleManager();
export const outbox = new OutboxStore();
export const inbox = new InboxConsumerRunner();

/**
 * ============================================================================
 * ÉPICA 11 (FT-11.1) — reporting-service: CQRS Projections & Business Intelligence
 * Cubre:
 *  - HU-103: Proyecciones CQRS (rpt_daily_sales, rpt_hourly_sales, rpt_product_sales_daily, rpt_shift_summary, rpt_terminal_status, rpt_inventory_alerts)
 *  - HU-104: Broadcaster para stream Server-Sent Events (/v1/app/reports/dashboard/stream)
 *  - HU-105, HU-238..HU-249: Consultas analíticas (por fecha, hora pico, medio de pago, rentabilidad, arqueos)
 *  - HU-359: Resumen de cierre de día para el dueño
 *  - HU-107, HU-484: Exportaciones contables y comprobantes PDF/Excel
 *  - HU-501: Reconciliación global nocturna inter-servicios
 * ============================================================================
 */

export interface RptDailySales {
  tenantId: string;
  branchId: string;
  terminalId: string;
  day: string; // YYYY-MM-DD
  tickets: number;
  grossTotalCents: number;
  discountTotalCents: number;
  taxTotalCents: number;
  returnsTotalCents: number;
  creditTotalCents: number;
  byPayment: Record<string, number>;
}

export interface RptHourlySales {
  tenantId: string;
  branchId: string;
  hour: string; // YYYY-MM-DD HH:00
  tickets: number;
  totalCents: number;
}

export interface RptProductSalesDaily {
  tenantId: string;
  branchId: string;
  productId: string;
  productName: string;
  day: string;
  quantityMilli: number;
  revenueCents: number;
  costCents: number;
}

export interface RptShiftSummary {
  tenantId: string;
  cashSessionId: string;
  branchId: string;
  terminalId: string;
  cashierId: string;
  openedAtMs: number;
  closedAtMs: number | null;
  expectedCashCents: number;
  declaredCashCents: number;
  differenceCents: number;
  status: "OPEN" | "CLOSED" | "CLOSED_WITH_DISCREPANCY";
}

export interface RptTerminalStatus {
  tenantId: string;
  terminalId: string;
  branchId: string;
  code: string;
  lastHeartbeatAtMs: number;
  pendingOutbox: number;
  oldestPendingAtMs: number | null;
  appVersion: string;
  health: "GREEN" | "YELLOW" | "RED";
}

export interface RptInventoryAlert {
  tenantId: string;
  branchId: string;
  productId: string;
  productName: string;
  kind: "LOW" | "NEGATIVE";
  onHandMilli: number;
  updatedAtMs: number;
}

export class ReportingService {
  public readonly dailySales = new Map<string, RptDailySales>();
  public readonly hourlySales = new Map<string, RptHourlySales>();
  public readonly productSalesDaily = new Map<string, RptProductSalesDaily>();
  public readonly shiftSummaries = new Map<string, RptShiftSummary>();
  public readonly terminalStatuses = new Map<string, RptTerminalStatus>();
  public readonly inventoryAlerts = new Map<string, RptInventoryAlert>();

  public readonly processedEventIds = new Set<string>();
  private readonly sseSubscribers = new Set<(event: { type: string; data: unknown }) => void>();

  /**
   * Suscribe clientes al stream SSE (HU-104)
   */
  subscribeSse(callback: (event: { type: string; data: unknown }) => void): () => void {
    this.sseSubscribers.add(callback);
    return () => this.sseSubscribers.delete(callback);
  }

  private broadcastSse(type: string, data: unknown): void {
    for (const sub of this.sseSubscribers) {
      try {
        sub({ type, data });
      } catch {
        // Ignorar fallas de conexión individual
      }
    }
  }

  /**
   * HU-103: Consume evento `sales.recorded` y actualiza proyecciones CQRS.
   */
  processSaleRecorded(event: {
    eventId: string;
    tenantId: string;
    branchId: string;
    terminalId: string;
    occurredAtMs: number;
    saleId: string;
    totalCents: number;
    discountCents: number;
    taxCents: number;
    paymentMethod: string;
    lines: { productId: string; productName: string; qtyMilli: number; subtotalCents: number; costCents?: number }[];
  }): void {
    if (this.processedEventIds.has(event.eventId)) {
      return; // Deduplicación idempotente
    }
    this.processedEventIds.add(event.eventId);

    const date = new Date(event.occurredAtMs);
    // Fecha local YYYY-MM-DD
    const day = date.toISOString().slice(0, 10);
    const hour = `${day} ${String(date.getUTCHours()).padStart(2, "0")}:00`;

    // 1. Proyección diaria
    const dailyKey = `${event.tenantId}:${event.branchId}:${event.terminalId}:${day}`;
    let daily = this.dailySales.get(dailyKey);
    if (!daily) {
      daily = {
        tenantId: event.tenantId,
        branchId: event.branchId,
        terminalId: event.terminalId,
        day,
        tickets: 0,
        grossTotalCents: 0,
        discountTotalCents: 0,
        taxTotalCents: 0,
        returnsTotalCents: 0,
        creditTotalCents: 0,
        byPayment: {}
      };
      this.dailySales.set(dailyKey, daily);
    }
    daily.tickets++;
    daily.grossTotalCents += event.totalCents;
    daily.discountTotalCents += event.discountCents;
    daily.taxTotalCents += event.taxCents;
    if (event.paymentMethod === "CREDIT") {
      daily.creditTotalCents += event.totalCents;
    }
    daily.byPayment[event.paymentMethod] = (daily.byPayment[event.paymentMethod] || 0) + event.totalCents;

    // 2. Proyección por hora
    const hourlyKey = `${event.tenantId}:${event.branchId}:${hour}`;
    let hourly = this.hourlySales.get(hourlyKey);
    if (!hourly) {
      hourly = {
        tenantId: event.tenantId,
        branchId: event.branchId,
        hour,
        tickets: 0,
        totalCents: 0
      };
      this.hourlySales.set(hourlyKey, hourly);
    }
    hourly.tickets++;
    hourly.totalCents += event.totalCents;

    // 3. Proyección de producto por día
    for (const line of event.lines) {
      const prodKey = `${event.tenantId}:${event.branchId}:${line.productId}:${day}`;
      let prod = this.productSalesDaily.get(prodKey);
      if (!prod) {
        prod = {
          tenantId: event.tenantId,
          branchId: event.branchId,
          productId: line.productId,
          productName: line.productName,
          day,
          quantityMilli: 0,
          revenueCents: 0,
          costCents: 0
        };
        this.productSalesDaily.set(prodKey, prod);
      }
      prod.quantityMilli += line.qtyMilli;
      prod.revenueCents += line.subtotalCents;
      prod.costCents += (line.costCents ?? 0) * (line.qtyMilli / 1000);
    }

    // HU-104: Difusión en tiempo real por SSE
    this.broadcastSse("sale_projection_updated", {
      tenantId: event.tenantId,
      day,
      newDailyTotalCents: daily.grossTotalCents,
      totalTickets: daily.tickets
    });
  }

  /**
   * Procesa cierre de turno para reportes y descuadres (HU-103, HU-245).
   */
  processShiftClosed(event: {
    eventId: string;
    tenantId: string;
    branchId: string;
    terminalId: string;
    cashSessionId: string;
    cashierId: string;
    openedAtMs: number;
    closedAtMs: number;
    expectedCashCents: number;
    declaredCashCents: number;
  }): void {
    if (this.processedEventIds.has(event.eventId)) return;
    this.processedEventIds.add(event.eventId);

    const differenceCents = event.declaredCashCents - event.expectedCashCents;
    const status = differenceCents === 0 ? "CLOSED" : "CLOSED_WITH_DISCREPANCY";

    this.shiftSummaries.set(event.cashSessionId, {
      tenantId: event.tenantId,
      branchId: event.branchId,
      terminalId: event.terminalId,
      cashSessionId: event.cashSessionId,
      cashierId: event.cashierId,
      openedAtMs: event.openedAtMs,
      closedAtMs: event.closedAtMs,
      expectedCashCents: event.expectedCashCents,
      declaredCashCents: event.declaredCashCents,
      differenceCents,
      status
    });
  }

  /**
   * Registra estado de salud de terminal (HU-105: semáforo verde, amarillo, rojo).
   */
  updateTerminalHeartbeat(event: {
    tenantId: string;
    branchId: string;
    terminalId: string;
    code: string;
    nowMs: number;
    pendingOutbox: number;
    oldestPendingAtMs: number | null;
    appVersion: string;
  }): void {
    // Semáforo:
    // Verde: heartbeat < 5 minutos (300.000 ms)
    // Amarillo: 5 min a 2 horas (7.200.000 ms)
    // Rojo: > 2 horas
    const ageMs = 0; // Se actualiza en este instante
    this.terminalStatuses.set(event.terminalId, {
      tenantId: event.tenantId,
      branchId: event.branchId,
      terminalId: event.terminalId,
      code: event.code,
      lastHeartbeatAtMs: event.nowMs,
      pendingOutbox: event.pendingOutbox,
      oldestPendingAtMs: event.oldestPendingAtMs,
      appVersion: event.appVersion,
      health: "GREEN"
    });
  }

  computeTerminalHealth(term: RptTerminalStatus, nowMs: number): "GREEN" | "YELLOW" | "RED" {
    const elapsed = nowMs - term.lastHeartbeatAtMs;
    if (elapsed <= 5 * 60 * 1000) return "GREEN";
    if (elapsed <= 2 * 60 * 60 * 1000) return "YELLOW";
    return "RED";
  }

  /**
   * HU-359: Vista de Resumen de Cierre del Día para el Dueño
   */
  getEndOfDayOwnerSummary(tenantId: string, day: string): {
    day: string;
    totalSalesCents: number;
    ticketsCount: number;
    netCashCents: number;
    digitalWalletsCents: number;
    creditGivenCents: number;
    debtCollectedCents: number;
    estimatedGrossProfitCents: number;
  } {
    const dailies = [...this.dailySales.values()].filter(
      (d) => d.tenantId === tenantId && d.day === day
    );

    const totalSalesCents = dailies.reduce((sum, d) => sum + d.grossTotalCents, 0);
    const ticketsCount = dailies.reduce((sum, d) => sum + d.tickets, 0);
    const creditGivenCents = dailies.reduce((sum, d) => sum + d.creditTotalCents, 0);

    let netCashCents = 0;
    let digitalWalletsCents = 0;
    for (const d of dailies) {
      netCashCents += d.byPayment["CASH"] || 0;
      digitalWalletsCents +=
        (d.byPayment["NEQUI"] || 0) +
        (d.byPayment["DAVIPLATA"] || 0) +
        (d.byPayment["BRE_B"] || 0) +
        (d.byPayment["CARD"] || 0);
    }

    // Margen estimado sobre ventas del día
    const prodSales = [...this.productSalesDaily.values()].filter(
      (p) => p.tenantId === tenantId && p.day === day
    );
    const totalCostCents = prodSales.reduce((sum, p) => sum + p.costCents, 0);
    const estimatedGrossProfitCents = totalSalesCents - totalCostCents;

    return {
      day,
      totalSalesCents,
      ticketsCount,
      netCashCents,
      digitalWalletsCents,
      creditGivenCents,
      debtCollectedCents: 0,
      estimatedGrossProfitCents
    };
  }

  /**
   * HU-243: Productos más vendidos (Top) y Productos Hueso (sin rotación)
   */
  getProductPerformance(tenantId: string, fromDay: string, toDay: string) {
    const list = [...this.productSalesDaily.values()].filter(
      (p) => p.tenantId === tenantId && p.day >= fromDay && p.day <= toDay
    );

    const aggregated = new Map<string, { productId: string; name: string; qty: number; revenue: number }>();
    for (const p of list) {
      const existing = aggregated.get(p.productId) || {
        productId: p.productId,
        name: p.productName,
        qty: 0,
        revenue: 0
      };
      existing.qty += p.quantityMilli / 1000;
      existing.revenue += p.revenueCents;
      aggregated.set(p.productId, existing);
    }

    const sortedByRevenue = [...aggregated.values()].sort((a, b) => b.revenue - a.revenue);
    return {
      topSelling: sortedByRevenue.slice(0, 10),
      slowMoving: sortedByRevenue.filter((p) => p.qty <= 2)
    };
  }

  /**
   * HU-107: Generador de Exportación Contable (Siigo / World Office / Alegra)
   */
  generateAccountingExport(tenantId: string, fromDay: string, toDay: string, software: "SIIGO" | "WORLD_OFFICE" | "ALEGRA"): {
    format: string;
    filename: string;
    rows: Array<Record<string, unknown>>;
  } {
    const dailies = [...this.dailySales.values()].filter(
      (d) => d.tenantId === tenantId && d.day >= fromDay && d.day <= toDay
    );

    const rows = dailies.map((d) => ({
      fecha: d.day,
      cuenta_ingreso: software === "SIIGO" ? "413501" : "4135",
      comprobante: `VENTA-${d.day}`,
      base_gravable_cents: d.grossTotalCents - d.taxTotalCents,
      iva_cents: d.taxTotalCents,
      total_cents: d.grossTotalCents,
      efectivo_cents: d.byPayment["CASH"] || 0,
      bancos_digitales_cents: (d.byPayment["NEQUI"] || 0) + (d.byPayment["DAVIPLATA"] || 0)
    }));

    return {
      format: "CSV",
      filename: `ReporteContable_${software}_${fromDay}_${toDay}.csv`,
      rows
    };
  }

  /**
   * HU-501: Tablero de Reconciliación Global Nocturna
   */
  reconcileGlobalTotals(params: {
    tenantId: string;
    day: string;
    salesDbTotalCents: number;
    cashDbTotalCents: number;
    inventoryMovementTotalUnits: number;
  }): {
    balanced: boolean;
    discrepancies: string[];
  } {
    const summary = this.getEndOfDayOwnerSummary(params.tenantId, params.day);
    const discrepancies: string[] = [];

    if (summary.totalSalesCents !== params.salesDbTotalCents) {
      discrepancies.push(
        `Descuadre en Ventas: reporting_db (${summary.totalSalesCents}) != sales_db (${params.salesDbTotalCents})`
      );
    }

    if (summary.netCashCents !== params.cashDbTotalCents) {
      discrepancies.push(
        `Descuadre en Efectivo: reporting_db (${summary.netCashCents}) != cash_db (${params.cashDbTotalCents})`
      );
    }

    return {
      balanced: discrepancies.length === 0,
      discrepancies
    };
  }
}
