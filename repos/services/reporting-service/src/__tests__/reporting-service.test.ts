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

  describe("Libro Fiscal de Registro de Operaciones Diarias (Art. 616 del E.T.)", () => {
    it("genera el libro fiscal mensual con desglose impositivo y cálculo progresivo de acumulado", () => {
      const tenantId = "t-fiscal-01";
      const oct1 = new Date("2026-10-01T14:00:00Z").getTime();
      const oct2 = new Date("2026-10-02T16:00:00Z").getTime();

      // Día 1: Venta 1 con desglose 19%, 5%, Exento y Excluido
      service.processSaleRecorded({
        eventId: "s-f01",
        tenantId,
        branchId: "b1",
        terminalId: "c1",
        occurredAtMs: oct1,
        saleId: "sale-01",
        receiptNumber: "POS-00101",
        totalCents: 1_000_000,
        discountCents: 50_000,
        taxCents: 100_000,
        paymentMethod: "CASH",
        taxBreakdown: {
          gravado19Cents: 500_000,
          gravado5Cents: 200_000,
          exentoCents: 150_000,
          excluidoCents: 150_000,
          inc8Cents: 0
        },
        lines: []
      });

      // Día 1: Venta 2 con INC 8% (comidas/bebidas)
      service.processSaleRecorded({
        eventId: "s-f02",
        tenantId,
        branchId: "b1",
        terminalId: "c1",
        occurredAtMs: oct1 + 3600_000,
        saleId: "sale-02",
        receiptNumber: "POS-00102",
        totalCents: 500_000,
        discountCents: 0,
        taxCents: 37_037,
        paymentMethod: "NEQUI",
        taxBreakdown: {
          gravado19Cents: 0,
          gravado5Cents: 0,
          exentoCents: 0,
          excluidoCents: 0,
          inc8Cents: 500_000
        },
        lines: []
      });

      // Día 1: Devolución parcial de $100.000
      service.processReturnRecorded({
        eventId: "ret-f01",
        tenantId,
        branchId: "b1",
        terminalId: "c1",
        occurredAtMs: oct1 + 7200_000,
        returnId: "ret-01",
        totalCents: 100_000
      });

      // Día 2: Venta 3
      service.processSaleRecorded({
        eventId: "s-f03",
        tenantId,
        branchId: "b1",
        terminalId: "c1",
        occurredAtMs: oct2,
        saleId: "sale-03",
        receiptNumber: "POS-00103",
        totalCents: 800_000,
        discountCents: 0,
        taxCents: 127_731,
        paymentMethod: "CASH",
        taxBreakdown: {
          gravado19Cents: 800_000,
          gravado5Cents: 0,
          exentoCents: 0,
          excluidoCents: 0,
          inc8Cents: 0
        },
        lines: []
      });

      const report = service.generateLibroFiscalDiario(tenantId, "2026-10", {
        valorUvtCents: 5_250_000 // 2026: $52.500 COP
      });

      expect(report.dias).toHaveLength(2);

      // Verificación Día 1
      const dia1 = report.dias[0]!;
      expect(dia1.fecha).toBe("2026-10-01");
      expect(dia1.consecutivoInicial).toBe("POS-00101");
      expect(dia1.consecutivoFinal).toBe("POS-00102");
      expect(dia1.totalTickets).toBe(2);
      expect(dia1.totalIngresosBrutosCents).toBe(1_500_000);
      expect(dia1.devolucionesCents).toBe(100_000);
      expect(dia1.totalIngresosNetosCents).toBe(1_400_000);
      expect(dia1.acumuladoMesCents).toBe(1_400_000);
      expect(dia1.ingresosGravados19Cents).toBe(500_000);
      expect(dia1.ingresosGravados5Cents).toBe(200_000);
      expect(dia1.ingresosExentosCents).toBe(150_000);
      expect(dia1.ingresosExcluidosCents).toBe(150_000);
      expect(dia1.ingresosImpoconsumo8Cents).toBe(500_000);

      // Verificación Día 2
      const dia2 = report.dias[1]!;
      expect(dia2.fecha).toBe("2026-10-02");
      expect(dia2.consecutivoInicial).toBe("POS-00103");
      expect(dia2.consecutivoFinal).toBe("POS-00103");
      expect(dia2.totalTickets).toBe(1);
      expect(dia2.totalIngresosNetosCents).toBe(800_000);
      expect(dia2.acumuladoMesCents).toBe(2_200_000); // 1.400.000 + 800.000

      // Verificación Totales del Mes
      expect(report.totalesMes.totalTickets).toBe(3);
      expect(report.totalesMes.totalIngresosBrutosCents).toBe(2_300_000);
      expect(report.totalesMes.devolucionesCents).toBe(100_000);
      expect(report.totalesMes.totalIngresosNetosCents).toBe(2_200_000);
      expect(report.totalesMes.ingresosGravados19Cents).toBe(1_300_000);

      // Verificación Alerta UVT (2.200.000 / (3500 * 52.500) ≈ 1.19% -> NORMAL)
      expect(report.uvtConfig.tope3500UvtCents).toBe(3500 * 5_250_000);
      expect(report.uvtConfig.alertaUvt).toBe("NORMAL");
      expect(report.uvtConfig.consumoUvtPorcentaje).toBeLessThan(80);
    });

    it("evalúa alerta preventiva y superación del tope de 3.500 UVT (Art. 437 E.T.)", () => {
      const tenantId = "t-uvt-test";
      const valorUvt = 5_000_000; // $50.000 COP por UVT
      const tope = 3500 * valorUvt; // $175.000.000 COP (17.500.000.000 centavos)

      // 1. Simulación al 85% del tope -> PREVENCION
      const venta85Percent = Math.floor(tope * 0.85);
      service.processSaleRecorded({
        eventId: "s-uvt-85",
        tenantId,
        branchId: "b1",
        terminalId: "c1",
        occurredAtMs: new Date("2026-06-15T12:00:00Z").getTime(),
        saleId: "sale-85",
        receiptNumber: "T-01",
        totalCents: venta85Percent,
        discountCents: 0,
        taxCents: 0,
        paymentMethod: "CASH",
        lines: []
      });

      const repPrevencion = service.generateLibroFiscalDiario(tenantId, "2026-06", {
        valorUvtCents: valorUvt
      });
      expect(repPrevencion.uvtConfig.alertaUvt).toBe("PREVENCION");
      expect(repPrevencion.uvtConfig.consumoUvtPorcentaje).toBeGreaterThanOrEqual(80);
      expect(repPrevencion.uvtConfig.consumoUvtPorcentaje).toBeLessThan(100);
      expect(repPrevencion.uvtConfig.mensajeAlerta).toContain("PREVENCIÓN");

      // 2. Simulación superando el 100% del tope -> SUPERADO
      service.processSaleRecorded({
        eventId: "s-uvt-105",
        tenantId,
        branchId: "b1",
        terminalId: "c1",
        occurredAtMs: new Date("2026-06-16T12:00:00Z").getTime(),
        saleId: "sale-105",
        receiptNumber: "T-02",
        totalCents: Math.floor(tope * 0.20), // Suma acumulada llega al 105%
        discountCents: 0,
        taxCents: 0,
        paymentMethod: "CASH",
        lines: []
      });

      const repSuperado = service.generateLibroFiscalDiario(tenantId, "2026-06", {
        valorUvtCents: valorUvt
      });
      expect(repSuperado.uvtConfig.alertaUvt).toBe("SUPERADO");
      expect(repSuperado.uvtConfig.consumoUvtPorcentaje).toBeGreaterThanOrEqual(100);
      expect(repSuperado.uvtConfig.mensajeAlerta).toContain("LÍMITE EXCEDIDO");
      expect(repSuperado.uvtConfig.mensajeAlerta).toContain("Factura Electrónica");
    });

    it("exporta Libro Fiscal a CSV legal e impresión de tiquete térmico 80mm", () => {
      const tenantId = "t-export-01";
      service.processSaleRecorded({
        eventId: "s-exp-01",
        tenantId,
        branchId: "b1",
        terminalId: "c1",
        occurredAtMs: new Date("2026-08-10T11:00:00Z").getTime(),
        saleId: "sale-exp-01",
        receiptNumber: "POS-00801",
        totalCents: 350_000,
        discountCents: 0,
        taxCents: 0,
        paymentMethod: "CASH",
        taxBreakdown: {
          gravado19Cents: 0,
          gravado5Cents: 0,
          exentoCents: 0,
          excluidoCents: 350_000,
          inc8Cents: 0
        },
        lines: []
      });

      // CSV legal
      const csvRes = service.exportLibroFiscalCsv(tenantId, "2026-08");
      expect(csvRes.filename).toBe("LibroFiscal_Art616_t-export-01_2026-08.csv");
      expect(csvRes.csv).toContain("Fecha,Consecutivo Inicial,Consecutivo Final");
      expect(csvRes.csv).toContain("2026-08-10,POS-00801,POS-00801,1,0.00,0.00,0.00,3500.00,0.00,3500.00,0.00,3500.00,3500.00");
      expect(csvRes.csv).toContain("TOTALES MES");

      // Tiquete térmico 80mm
      const thermalText = service.exportLibroFiscalThermalReceipt(tenantId, "2026-08-10");
      expect(thermalText).toContain("LIBRO FISCAL DE OPERACIONES DIARIAS");
      expect(thermalText).toContain("(Art. 616 del E.T.)");
      expect(thermalText).toContain("Fecha: 2026-08-10");
      expect(thermalText).toContain("Consecutivo Inicial: POS-00801");
      expect(thermalText).toContain("Consecutivo Final:   POS-00801");
      expect(thermalText).toContain("INGRESOS NETOS DEL DÍA:");
      expect(thermalText).toContain("Consumo Tope UVT:");
    });
  });
});
