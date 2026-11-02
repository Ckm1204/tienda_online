import { describe, it, expect, beforeEach } from "vitest";
import { ReportingService } from "../index.js";

describe("ReportingService CQRS & BI Unit Tests (ÉPICA 11: FT-11.1)", () => {
  let service: ReportingService;

  beforeEach(() => {
    service = new ReportingService();
  });

  it("HU-103: procesa ventas y actualiza proyecciones diarias, por hora y por producto", () => {
    const occurredAt = new Date("2026-10-31T15:30:00Z").getTime();

    service.processSaleRecorded({
      eventId: "evt-001",
      tenantId: "t1",
      branchId: "b1",
      terminalId: "caja-1",
      occurredAtMs: occurredAt,
      saleId: "sale-001",
      totalCents: 1500000,
      discountCents: 50000,
      taxCents: 239495,
      paymentMethod: "CASH",
      lines: [
        {
          productId: "p1",
          productName: "Arroz Diana 1kg",
          qtyMilli: 2000,
          subtotalCents: 900000,
          costCents: 380000
        },
        {
          productId: "p2",
          productName: "Aceite Premier 1000ml",
          qtyMilli: 1000,
          subtotalCents: 600000,
          costCents: 450000
        }
      ]
    });

    const daily = [...service.dailySales.values()][0];
    expect(daily).toBeDefined();
    expect(daily?.tickets).toBe(1);
    expect(daily?.grossTotalCents).toBe(1500000);
    expect(daily?.byPayment["CASH"]).toBe(1500000);

    const hourly = [...service.hourlySales.values()][0];
    expect(hourly?.tickets).toBe(1);
    expect(hourly?.totalCents).toBe(1500000);

    const prodSales = [...service.productSalesDaily.values()];
    expect(prodSales.length).toBe(2);
    expect(prodSales.find((p) => p.productId === "p1")?.quantityMilli).toBe(2000);
  });

  it("HU-104: difunde eventos SSE cuando se actualizan las proyecciones", () => {
    const received: any[] = [];
    const unsubscribe = service.subscribeSse((evt) => received.push(evt));

    service.processSaleRecorded({
      eventId: "evt-002",
      tenantId: "t1",
      branchId: "b1",
      terminalId: "caja-1",
      occurredAtMs: Date.now(),
      saleId: "sale-002",
      totalCents: 2000000,
      discountCents: 0,
      taxCents: 0,
      paymentMethod: "NEQUI",
      lines: []
    });

    expect(received.length).toBe(1);
    expect(received[0].type).toBe("sale_projection_updated");
    expect(received[0].data.newDailyTotalCents).toBe(2000000);

    unsubscribe();
  });

  it("HU-105: computa semáforo de salud de cajas (Verde, Amarillo, Rojo)", () => {
    const now = 10000000;

    // Caja sincronizada hace 2 minutos -> Verde
    const termGreen = {
      tenantId: "t1",
      branchId: "b1",
      terminalId: "c1",
      code: "CAJA-01",
      lastHeartbeatAtMs: now - 2 * 60 * 1000,
      pendingOutbox: 0,
      oldestPendingAtMs: null,
      appVersion: "1.0.0",
      health: "GREEN" as const
    };
    expect(service.computeTerminalHealth(termGreen, now)).toBe("GREEN");

    // Caja sin señal hace 30 minutos -> Amarillo
    const termYellow = {
      ...termGreen,
      lastHeartbeatAtMs: now - 30 * 60 * 1000
    };
    expect(service.computeTerminalHealth(termYellow, now)).toBe("YELLOW");

    // Caja desconectada hace 3 horas -> Rojo
    const termRed = {
      ...termGreen,
      lastHeartbeatAtMs: now - 180 * 60 * 1000
    };
    expect(service.computeTerminalHealth(termRed, now)).toBe("RED");
  });

  it("HU-359: calcula el resumen de cierre del día para el dueño", () => {
    const day = "2026-10-31";
    const ts = new Date(`${day}T12:00:00Z`).getTime();

    // Venta en efectivo
    service.processSaleRecorded({
      eventId: "s1",
      tenantId: "t1",
      branchId: "b1",
      terminalId: "c1",
      occurredAtMs: ts,
      saleId: "sale-1",
      totalCents: 500000,
      discountCents: 0,
      taxCents: 0,
      paymentMethod: "CASH",
      lines: [{ productId: "p1", productName: "Item", qtyMilli: 1000, subtotalCents: 500000, costCents: 350000 }]
    });

    // Venta por Nequi
    service.processSaleRecorded({
      eventId: "s2",
      tenantId: "t1",
      branchId: "b1",
      terminalId: "c1",
      occurredAtMs: ts,
      saleId: "sale-2",
      totalCents: 300000,
      discountCents: 0,
      taxCents: 0,
      paymentMethod: "NEQUI",
      lines: [{ productId: "p1", productName: "Item", qtyMilli: 1000, subtotalCents: 300000, costCents: 200000 }]
    });

    const summary = service.getEndOfDayOwnerSummary("t1", day);
    expect(summary.totalSalesCents).toBe(800000);
    expect(summary.netCashCents).toBe(500000);
    expect(summary.digitalWalletsCents).toBe(300000);
    expect(summary.estimatedGrossProfitCents).toBe(250000); // 800000 - 550000
  });

  it("HU-107: genera exportación contable estructurada para Siigo", () => {
    const day = "2026-10-31";
    service.processSaleRecorded({
      eventId: "e1",
      tenantId: "t1",
      branchId: "b1",
      terminalId: "c1",
      occurredAtMs: new Date(`${day}T10:00:00Z`).getTime(),
      saleId: "s1",
      totalCents: 1000000,
      discountCents: 0,
      taxCents: 190000,
      paymentMethod: "CASH",
      lines: []
    });

    const exp = service.generateAccountingExport("t1", day, day, "SIIGO");
    expect(exp.filename).toContain("SIIGO");
    expect(exp.rows.length).toBe(1);
    expect(exp.rows[0]?.cuenta_ingreso).toBe("413501");
    expect(exp.rows[0]?.iva_cents).toBe(190000);
  });

  it("HU-501: detecta descuadres en la reconciliación global nocturna", () => {
    const day = "2026-10-31";
    service.processSaleRecorded({
      eventId: "e2",
      tenantId: "t1",
      branchId: "b1",
      terminalId: "c1",
      occurredAtMs: new Date(`${day}T10:00:00Z`).getTime(),
      saleId: "s2",
      totalCents: 500000,
      discountCents: 0,
      taxCents: 0,
      paymentMethod: "CASH",
      lines: []
    });

    // Sin descuadre
    const okReconciliation = service.reconcileGlobalTotals({
      tenantId: "t1",
      day,
      salesDbTotalCents: 500000,
      cashDbTotalCents: 500000,
      inventoryMovementTotalUnits: 1
    });
    expect(okReconciliation.balanced).toBe(true);

    // Con descuadre en sales_db
    const mismatchReconciliation = service.reconcileGlobalTotals({
      tenantId: "t1",
      day,
      salesDbTotalCents: 600000, // Descuadre
      cashDbTotalCents: 500000,
      inventoryMovementTotalUnits: 1
    });
    expect(mismatchReconciliation.balanced).toBe(false);
    expect(mismatchReconciliation.discrepancies.length).toBeGreaterThan(0);
  });
});
