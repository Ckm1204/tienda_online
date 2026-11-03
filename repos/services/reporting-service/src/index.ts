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
  // Art. 616 E.T. Libro Fiscal
  firstReceiptNumber?: string | null;
  lastReceiptNumber?: string | null;
  gravado19Cents?: number;
  gravado5Cents?: number;
  exentoCents?: number;
  excluidoCents?: number;
  inc8Cents?: number;
}

export interface LibroFiscalDailyEntry {
  fecha: string; // YYYY-MM-DD
  consecutivoInicial: string;
  consecutivoFinal: string;
  totalTickets: number;
  ingresosGravados19Cents: number;
  ingresosGravados5Cents: number;
  ingresosExentosCents: number;
  ingresosExcluidosCents: number;
  ingresosImpoconsumo8Cents: number;
  totalIngresosBrutosCents: number;
  descuentosCents: number;
  devolucionesCents: number;
  totalIngresosNetosCents: number;
  acumuladoMesCents: number;
}

export interface LibroFiscalMonthReport {
  tenantId: string;
  yearMonth: string; // YYYY-MM
  dias: LibroFiscalDailyEntry[];
  totalesMes: {
    totalTickets: number;
    ingresosGravados19Cents: number;
    ingresosGravados5Cents: number;
    ingresosExentosCents: number;
    ingresosExcluidosCents: number;
    ingresosImpoconsumo8Cents: number;
    totalIngresosBrutosCents: number;
    descuentosCents: number;
    devolucionesCents: number;
    totalIngresosNetosCents: number;
  };
  acumuladoAnioCents: number;
  uvtConfig: {
    year: number;
    valorUvtCents: number;
    tope3500UvtCents: number;
    consumoUvtBps: number;
    consumoUvtPorcentaje: number;
    alertaUvt: "NORMAL" | "PREVENCION" | "SUPERADO";
    mensajeAlerta: string;
  };
}

export const COLOMBIA_UVT_CENTS_BY_YEAR: Record<number, number> = {
  2024: 4_706_500, // $47.065 COP
  2025: 4_979_900, // $49.799 COP
  2026: 5_250_000  // $52.500 COP
};

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
    receiptNumber?: string;
    taxBreakdown?: {
      gravado19Cents?: number;
      gravado5Cents?: number;
      exentoCents?: number;
      excluidoCents?: number;
      inc8Cents?: number;
    };
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
        byPayment: {},
        firstReceiptNumber: event.receiptNumber ?? null,
        lastReceiptNumber: event.receiptNumber ?? null,
        gravado19Cents: 0,
        gravado5Cents: 0,
        exentoCents: 0,
        excluidoCents: 0,
        inc8Cents: 0
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

    // Actualizar consecutivos de recibo (Art. 616 E.T.)
    if (event.receiptNumber) {
      if (!daily.firstReceiptNumber) {
        daily.firstReceiptNumber = event.receiptNumber;
      }
      daily.lastReceiptNumber = event.receiptNumber;
    }

    // Actualizar desagregación tributaria para Libro Fiscal
    if (event.taxBreakdown) {
      daily.gravado19Cents = (daily.gravado19Cents ?? 0) + (event.taxBreakdown.gravado19Cents ?? 0);
      daily.gravado5Cents = (daily.gravado5Cents ?? 0) + (event.taxBreakdown.gravado5Cents ?? 0);
      daily.exentoCents = (daily.exentoCents ?? 0) + (event.taxBreakdown.exentoCents ?? 0);
      daily.excluidoCents = (daily.excluidoCents ?? 0) + (event.taxBreakdown.excluidoCents ?? 0);
      daily.inc8Cents = (daily.inc8Cents ?? 0) + (event.taxBreakdown.inc8Cents ?? 0);
    } else if (event.taxCents > 0) {
      daily.gravado19Cents = (daily.gravado19Cents ?? 0) + event.totalCents;
    } else {
      daily.excluidoCents = (daily.excluidoCents ?? 0) + event.totalCents;
    }

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
   * Procesa evento de devolución para actualizar devoluciones en Libro Fiscal.
   */
  processReturnRecorded(event: {
    eventId: string;
    tenantId: string;
    branchId: string;
    terminalId: string;
    occurredAtMs: number;
    returnId: string;
    totalCents: number;
    taxCents?: number;
  }): void {
    if (this.processedEventIds.has(event.eventId)) return;
    this.processedEventIds.add(event.eventId);

    const date = new Date(event.occurredAtMs);
    const day = date.toISOString().slice(0, 10);
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
        byPayment: {},
        firstReceiptNumber: null,
        lastReceiptNumber: null,
        gravado19Cents: 0,
        gravado5Cents: 0,
        exentoCents: 0,
        excluidoCents: 0,
        inc8Cents: 0
      };
      this.dailySales.set(dailyKey, daily);
    }
    daily.returnsTotalCents += event.totalCents;
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

  /**
   * Genera el Libro Fiscal de Registro de Operaciones Diarias (Art. 616 del E.T.)
   * para comerciantes no obligados a facturar / Régimen Simple.
   */
  generateLibroFiscalDiario(
    tenantId: string,
    yearMonth: string, // YYYY-MM
    options?: { uvtYear?: number; valorUvtCents?: number }
  ): LibroFiscalMonthReport {
    const year = Number.parseInt(yearMonth.slice(0, 4), 10);
    const uvtYear = options?.uvtYear ?? year;
    const valorUvtCents = options?.valorUvtCents ?? COLOMBIA_UVT_CENTS_BY_YEAR[uvtYear] ?? 5_250_000;
    const tope3500UvtCents = 3500 * valorUvtCents;

    // Obtener todas las ventas del tenant para el mes especificado
    const monthDailies = [...this.dailySales.values()].filter(
      (d) => d.tenantId === tenantId && d.day.startsWith(yearMonth)
    );

    // Agrupar por día YYYY-MM-DD
    const daysMap = new Map<string, LibroFiscalDailyEntry>();

    for (const d of monthDailies) {
      let entry = daysMap.get(d.day);
      if (!entry) {
        entry = {
          fecha: d.day,
          consecutivoInicial: d.firstReceiptNumber ?? `T-${d.day}-001`,
          consecutivoFinal: d.lastReceiptNumber ?? `T-${d.day}-${String(d.tickets).padStart(3, "0")}`,
          totalTickets: 0,
          ingresosGravados19Cents: 0,
          ingresosGravados5Cents: 0,
          ingresosExentosCents: 0,
          ingresosExcluidosCents: 0,
          ingresosImpoconsumo8Cents: 0,
          totalIngresosBrutosCents: 0,
          descuentosCents: 0,
          devolucionesCents: 0,
          totalIngresosNetosCents: 0,
          acumuladoMesCents: 0
        };
        daysMap.set(d.day, entry);
      }
      entry.totalTickets += d.tickets;
      entry.totalIngresosBrutosCents += d.grossTotalCents;
      entry.descuentosCents += d.discountTotalCents;
      entry.devolucionesCents += d.returnsTotalCents;
      entry.ingresosGravados19Cents += d.gravado19Cents ?? 0;
      entry.ingresosGravados5Cents += d.gravado5Cents ?? 0;
      entry.ingresosExentosCents += d.exentoCents ?? 0;
      entry.ingresosExcluidosCents += d.excluidoCents ?? 0;
      entry.ingresosImpoconsumo8Cents += d.inc8Cents ?? 0;
      if (d.firstReceiptNumber && (!entry.consecutivoInicial || d.firstReceiptNumber < entry.consecutivoInicial)) {
        entry.consecutivoInicial = d.firstReceiptNumber;
      }
      if (d.lastReceiptNumber && (!entry.consecutivoFinal || d.lastReceiptNumber > entry.consecutivoFinal)) {
        entry.consecutivoFinal = d.lastReceiptNumber;
      }
    }

    // Ordenar días cronológicamente y calcular acumulado mensual progresivo
    const sortedDays = [...daysMap.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
    let runningMonthCents = 0;

    const totalesMes = {
      totalTickets: 0,
      ingresosGravados19Cents: 0,
      ingresosGravados5Cents: 0,
      ingresosExentosCents: 0,
      ingresosExcluidosCents: 0,
      ingresosImpoconsumo8Cents: 0,
      totalIngresosBrutosCents: 0,
      descuentosCents: 0,
      devolucionesCents: 0,
      totalIngresosNetosCents: 0
    };

    for (const dayEntry of sortedDays) {
      dayEntry.totalIngresosNetosCents = Math.max(0, dayEntry.totalIngresosBrutosCents - dayEntry.devolucionesCents);
      runningMonthCents += dayEntry.totalIngresosNetosCents;
      dayEntry.acumuladoMesCents = runningMonthCents;

      totalesMes.totalTickets += dayEntry.totalTickets;
      totalesMes.ingresosGravados19Cents += dayEntry.ingresosGravados19Cents;
      totalesMes.ingresosGravados5Cents += dayEntry.ingresosGravados5Cents;
      totalesMes.ingresosExentosCents += dayEntry.ingresosExentosCents;
      totalesMes.ingresosExcluidosCents += dayEntry.ingresosExcluidosCents;
      totalesMes.ingresosImpoconsumo8Cents += dayEntry.ingresosImpoconsumo8Cents;
      totalesMes.totalIngresosBrutosCents += dayEntry.totalIngresosBrutosCents;
      totalesMes.descuentosCents += dayEntry.descuentosCents;
      totalesMes.devolucionesCents += dayEntry.devolucionesCents;
      totalesMes.totalIngresosNetosCents += dayEntry.totalIngresosNetosCents;
    }

    // Calcular acumulado anual del año calendario correspondiente
    const yearPrefix = String(year);
    const annualDailies = [...this.dailySales.values()].filter(
      (d) => d.tenantId === tenantId && d.day.startsWith(yearPrefix)
    );
    const acumuladoAnualCents = annualDailies.reduce(
      (acc, d) => acc + Math.max(0, d.grossTotalCents - d.returnsTotalCents),
      0
    );

    // Consumo de UVT en puntos básicos (basis points: 10000 = 100.00%)
    const consumoUvtBps = Math.floor((acumuladoAnualCents * 10_000) / tope3500UvtCents);
    const consumoUvtPorcentaje = Math.round((consumoUvtBps / 100) * 100) / 100;

    let alertaUvt: "NORMAL" | "PREVENCION" | "SUPERADO" = "NORMAL";
    let mensajeAlerta = `Dentro del límite de 3.500 UVT (${consumoUvtPorcentaje}% consumido). Régimen simplificado / no responsable habilitado.`;

    if (consumoUvtBps >= 10_000) {
      alertaUvt = "SUPERADO";
      mensajeAlerta = `LÍMITE EXCEDIDO: Ha superado las 3.500 UVT anuales (${consumoUvtPorcentaje}%). Por mandato del Art. 437 del E.T. debe inscribirse como responsable de IVA y expedir Factura Electrónica.`;
    } else if (consumoUvtBps >= 8_000) {
      alertaUvt = "PREVENCION";
      mensajeAlerta = `PREVENCIÓN: Ha alcanzado el ${consumoUvtPorcentaje}% de las 3.500 UVT anuales. Prepare la migración a Facturación Electrónica DIAN antes de finalizar el periodo.`;
    }

    return {
      tenantId,
      yearMonth,
      dias: sortedDays,
      totalesMes,
      acumuladoAnioCents: acumuladoAnualCents,
      uvtConfig: {
        year: uvtYear,
        valorUvtCents,
        tope3500UvtCents,
        consumoUvtBps,
        consumoUvtPorcentaje,
        alertaUvt,
        mensajeAlerta
      }
    };
  }

  /**
   * Exporta el Libro Fiscal mensual a formato CSV legal para inspección tributaria.
   */
  exportLibroFiscalCsv(
    tenantId: string,
    yearMonth: string,
    options?: { uvtYear?: number; valorUvtCents?: number }
  ): { filename: string; csv: string } {
    const report = this.generateLibroFiscalDiario(tenantId, yearMonth, options);
    const headers = [
      "Fecha",
      "Consecutivo Inicial",
      "Consecutivo Final",
      "Total Tickets",
      "Gravado 19% (COP)",
      "Gravado 5% (COP)",
      "Exento (COP)",
      "Excluido (COP)",
      "INC 8% (COP)",
      "Total Bruto (COP)",
      "Devoluciones (COP)",
      "Total Neto (COP)",
      "Acumulado Mes (COP)"
    ];

    const rows = report.dias.map((d) => [
      d.fecha,
      d.consecutivoInicial,
      d.consecutivoFinal,
      String(d.totalTickets),
      (d.ingresosGravados19Cents / 100).toFixed(2),
      (d.ingresosGravados5Cents / 100).toFixed(2),
      (d.ingresosExentosCents / 100).toFixed(2),
      (d.ingresosExcluidosCents / 100).toFixed(2),
      (d.ingresosImpoconsumo8Cents / 100).toFixed(2),
      (d.totalIngresosBrutosCents / 100).toFixed(2),
      (d.devolucionesCents / 100).toFixed(2),
      (d.totalIngresosNetosCents / 100).toFixed(2),
      (d.acumuladoMesCents / 100).toFixed(2)
    ]);

    const t = report.totalesMes;
    rows.push([
      "TOTALES MES",
      "-",
      "-",
      String(t.totalTickets),
      (t.ingresosGravados19Cents / 100).toFixed(2),
      (t.ingresosGravados5Cents / 100).toFixed(2),
      (t.ingresosExentosCents / 100).toFixed(2),
      (t.ingresosExcluidosCents / 100).toFixed(2),
      (t.ingresosImpoconsumo8Cents / 100).toFixed(2),
      (t.totalIngresosBrutosCents / 100).toFixed(2),
      (t.devolucionesCents / 100).toFixed(2),
      (t.totalIngresosNetosCents / 100).toFixed(2),
      (report.acumuladoAnioCents / 100).toFixed(2)
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    return {
      filename: `LibroFiscal_Art616_${tenantId}_${yearMonth}.csv`,
      csv: csvContent
    };
  }

  /**
   * Genera el comprobante diario del Libro Fiscal para impresión térmica (80mm)
   * o registro en el libro físico empastado.
   */
  exportLibroFiscalThermalReceipt(
    tenantId: string,
    day: string,
    options?: { uvtYear?: number; valorUvtCents?: number }
  ): string {
    const yearMonth = day.slice(0, 7);
    const report = this.generateLibroFiscalDiario(tenantId, yearMonth, options);
    const entry = report.dias.find((d) => d.fecha === day) ?? {
      fecha: day,
      consecutivoInicial: "N/A",
      consecutivoFinal: "N/A",
      totalTickets: 0,
      ingresosGravados19Cents: 0,
      ingresosGravados5Cents: 0,
      ingresosExentosCents: 0,
      ingresosExcluidosCents: 0,
      ingresosImpoconsumo8Cents: 0,
      totalIngresosBrutosCents: 0,
      descuentosCents: 0,
      devolucionesCents: 0,
      totalIngresosNetosCents: 0,
      acumuladoMesCents: 0
    };

    const fmt = (cents: number) => `$ ${(cents / 100).toLocaleString("es-CO")}`;

    return [
      "================================================",
      "       LIBRO FISCAL DE OPERACIONES DIARIAS      ",
      "              (Art. 616 del E.T.)               ",
      "================================================",
      `Fecha: ${entry.fecha}`,
      `Consecutivo Inicial: ${entry.consecutivoInicial}`,
      `Consecutivo Final:   ${entry.consecutivoFinal}`,
      `Total Facturas/Tickets: ${entry.totalTickets}`,
      "------------------------------------------------",
      `Gravado Tarifa 19%:         ${fmt(entry.ingresosGravados19Cents).padStart(20)}`,
      `Gravado Tarifa 5%:          ${fmt(entry.ingresosGravados5Cents).padStart(20)}`,
      `Exento Canasta Familiar:    ${fmt(entry.ingresosExentosCents).padStart(20)}`,
      `Excluido de Impuestos:      ${fmt(entry.ingresosExcluidosCents).padStart(20)}`,
      `Impoconsumo (INC 8%):       ${fmt(entry.ingresosImpoconsumo8Cents).padStart(20)}`,
      "------------------------------------------------",
      `INGRESOS BRUTOS DEL DÍA:    ${fmt(entry.totalIngresosBrutosCents).padStart(20)}`,
      `Devoluciones y Anulaciones: ${fmt(entry.devolucionesCents).padStart(20)}`,
      `INGRESOS NETOS DEL DÍA:     ${fmt(entry.totalIngresosNetosCents).padStart(20)}`,
      "================================================",
      `Acumulado Mes (${yearMonth}):  ${fmt(entry.acumuladoMesCents).padStart(18)}`,
      `Acumulado Año Calendario:   ${fmt(report.acumuladoAnioCents).padStart(18)}`,
      `Tope 3.500 UVT (${report.uvtConfig.year}):       ${fmt(report.uvtConfig.tope3500UvtCents).padStart(18)}`,
      `Consumo Tope UVT:            ${report.uvtConfig.consumoUvtPorcentaje}% [${report.uvtConfig.alertaUvt}]`,
      "------------------------------------------------",
      report.uvtConfig.mensajeAlerta,
      "================================================"
    ].join("\n");
  }
}
