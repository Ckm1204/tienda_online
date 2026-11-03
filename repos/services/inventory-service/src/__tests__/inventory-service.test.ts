import { describe, it, expect, beforeEach } from "vitest";
import { InventoryService } from "../index.js";

describe("ÉPICA 09 (FT-09.3) — inventory-service: Kardex, Costeo Ponderado, Ajustes y Traslados", () => {
  let svc: InventoryService;
  const tenantId = "tenant-esmeralda-01";
  const warehouseId = "wh-principal";
  const t0 = 1_760_000_000_000;

  beforeEach(() => {
    svc = new InventoryService();
  });

  it("HU-447: Registra inventario inicial y establece niveles de stock mínimo e ideal", () => {
    const lvl = svc.recordInitialStock({
      tenantId,
      warehouseId,
      productId: "prod-arroz",
      qtyMilli: 50_000, // 50 unidades (kg)
      unitCostCents: 3_500_00, // $3.500 COP
      minStockMilli: 10_000,
      idealStockMilli: 60_000,
      occurredAtMs: t0
    });

    expect(lvl.on_hand_milli).toBe(50_000);
    expect(lvl.avg_cost_cents).toBe(3_500_00);
    expect(lvl.min_stock_milli).toBe(10_000);
    expect(lvl.ideal_stock_milli).toBe(60_000);
    expect(svc.movements.length).toBe(1);
    expect(svc.movements[0]?.kind).toBe("INITIAL_STOCK");
  });

  it("HU-088, HU-280 & HU-303: Aplica deltas conmutativos de venta y emite alerta si cae a stock negativo", () => {
    // 1. Stock inicial de 10 unidades
    svc.recordInitialStock({
      tenantId,
      warehouseId,
      productId: "prod-aceite",
      qtyMilli: 10_000,
      unitCostCents: 9_000_00,
      occurredAtMs: t0
    });

    // 2. Venta de 6 unidades
    const res1 = svc.applySaleOrReturnDelta({
      eventId: "evt-sale-01",
      tenantId,
      warehouseId,
      productId: "prod-aceite",
      trackStock: true,
      deltaMilli: -6_000,
      kind: "SALE",
      occurredAtMs: t0 + 1000
    });
    expect(res1.ignored).toBe(false);
    expect(res1.onHandMilli).toBe(4_000);
    expect(res1.negativeAlertEmitted).toBe(false);

    // 3. Venta adicional de 5 unidades (sobreventa en mostrador -> cae a -1 unidad)
    const res2 = svc.applySaleOrReturnDelta({
      eventId: "evt-sale-02",
      tenantId,
      warehouseId,
      productId: "prod-aceite",
      trackStock: true,
      deltaMilli: -5_000,
      kind: "SALE",
      occurredAtMs: t0 + 2000
    });
    expect(res2.onHandMilli).toBe(-1_000);
    expect(res2.negativeAlertEmitted).toBe(true);
    expect(svc.publishedEvents.length).toBe(1);
    expect((svc.publishedEvents[0]?.payload as any).type).toBe("inventory.negative_detected");

    // 4. Devolución de cliente restaura el inventario a positivo (+2 unidades -> 1 unidad)
    const res3 = svc.applySaleOrReturnDelta({
      eventId: "evt-ret-01",
      tenantId,
      warehouseId,
      productId: "prod-aceite",
      trackStock: true,
      deltaMilli: 2_000,
      kind: "RETURN",
      occurredAtMs: t0 + 3000
    });
    expect(res3.onHandMilli).toBe(1_000);

    // 5. Productos con trackStock = false son ignorados sin alterar movimientos
    const resGeneric = svc.applySaleOrReturnDelta({
      eventId: "evt-sale-03",
      tenantId,
      warehouseId,
      productId: "prod-bolsa-plastica",
      trackStock: false,
      deltaMilli: -10_000,
      kind: "SALE",
      occurredAtMs: t0 + 4000
    });
    expect(resGeneric.ignored).toBe(true);
  });

  it("HU-089 & HU-400: Recalcula costo promedio ponderado exacto en recepción de mercancía y enlaza pago de caja", () => {
    // 10 unidades a $2.000 COP cada una
    svc.recordInitialStock({
      tenantId,
      warehouseId,
      productId: "prod-leche",
      qtyMilli: 10_000,
      unitCostCents: 2_000_00,
      occurredAtMs: t0
    });

    // Nueva compra: 10 unidades a $2.500 COP
    // Costo promedio esperado: (10 * 2000 + 10 * 2500) / 20 = $2.250 COP
    const updated = svc.recordPurchaseReceipt({
      tenantId,
      warehouseId,
      productId: "prod-leche",
      qtyMilli: 10_000,
      unitCostCents: 2_500_00,
      paidFromCashSessionId: "session-caja-01",
      batchExpiryDate: "2026-12-31",
      occurredAtMs: t0 + 5000
    });

    expect(updated.on_hand_milli).toBe(20_000);
    expect(updated.avg_cost_cents).toBe(2_250_00);

    const mov = svc.movements[svc.movements.length - 1];
    expect(mov?.kind).toBe("RECEIPT");
    expect(mov?.paid_from_cash_session_id).toBe("session-caja-01");
    expect(mov?.batch_expiry_date).toBe("2026-12-31");
  });

  it("HU-090 & HU-091: Permite ajustes por merma/avería/vencimiento y correcciones por conteo físico as-of", () => {
    svc.recordInitialStock({
      tenantId,
      warehouseId,
      productId: "prod-galletas",
      qtyMilli: 30_000,
      unitCostCents: 1_200_00,
      occurredAtMs: t0
    });

    // Ajuste por avería de 2 paquetes
    const adj = svc.recordInventoryAdjustment({
      tenantId,
      warehouseId,
      productId: "prod-galletas",
      deltaMilli: -2_000,
      kind: "ADJUSTMENT_DAMAGED",
      reason: "Empaque roto en transporte",
      occurredAtMs: t0 + 1000
    });
    expect(adj.on_hand_milli).toBe(28_000);

    // Conteo ciego físico con fecha de corte: se cuentan 25 unidades (faltante de 3)
    const countRes = svc.applyPhysicalCountAsOf({
      tenantId,
      warehouseId,
      productId: "prod-galletas",
      countedQtyMilli: 25_000,
      asOfMs: t0 + 2000
    });
    expect(countRes.adjustmentDeltaMilli).toBe(-3_000);
    expect(countRes.finalOnHandMilli).toBe(25_000);
  });

  it("HU-092 & HU-401: Traslados entre bodegas con estados IN_TRANSIT, recepción completa y con diferencias", () => {
    // Bodega central con 100 unidades
    svc.recordInitialStock({
      tenantId,
      warehouseId: "wh-central",
      productId: "prod-arroz",
      qtyMilli: 100_000,
      unitCostCents: 3_500_00,
      occurredAtMs: t0
    });

    // 1. Iniciar despacho de traslado de 40 unidades hacia bodega sucursal
    const transfer = svc.dispatchWarehouseTransfer({
      tenantId,
      fromWarehouseId: "wh-central",
      toWarehouseId: "wh-sucursal",
      productId: "prod-arroz",
      qtyMilli: 40_000,
      nowMs: t0 + 1000
    });
    expect(transfer.status).toBe("IN_TRANSIT");
    expect(svc.getOrCreateLevel(tenantId, "wh-central", "prod-arroz").on_hand_milli).toBe(60_000);

    // 2. Recepción en destino con avería de 2 unidades (se reciben físicamente 38 unidades)
    const received = svc.receiveWarehouseTransfer({
      transferId: transfer.id,
      receivedQtyMilli: 38_000,
      diffNote: "2 bolsas llegaron rotas",
      nowMs: t0 + 2000
    });
    expect(received.status).toBe("RECEIVED_WITH_DIFF");
    expect(received.diff_note).toBe("2 bolsas llegaron rotas");
    expect(svc.getOrCreateLevel(tenantId, "wh-sucursal", "prod-arroz").on_hand_milli).toBe(38_000);
  });

  it("HU-194: Reconstruye exactamente stock_levels a partir del histórico inmutable de movimientos", () => {
    svc.recordInitialStock({
      tenantId,
      warehouseId,
      productId: "prod-panela",
      qtyMilli: 50_000,
      unitCostCents: 4_000_00,
      occurredAtMs: t0
    });

    svc.applySaleOrReturnDelta({
      eventId: "evt-sale-p1",
      tenantId,
      warehouseId,
      productId: "prod-panela",
      trackStock: true,
      deltaMilli: -15_000,
      kind: "SALE",
      occurredAtMs: t0 + 1000
    });

    svc.recordInventoryAdjustment({
      tenantId,
      warehouseId,
      productId: "prod-panela",
      deltaMilli: -2_000,
      kind: "ADJUSTMENT_SHRINKAGE",
      reason: "Merma por humedad",
      occurredAtMs: t0 + 2000
    });

    expect(svc.getOrCreateLevel(tenantId, warehouseId, "prod-panela").on_hand_milli).toBe(33_000);

    // Forzar corrupción en caché de nivel de stock
    svc.getOrCreateLevel(tenantId, warehouseId, "prod-panela").on_hand_milli = 999_999;

    // Reconstruir desde libro mayor inmutable
    svc.rebuildStockLevelsFromMovements(tenantId);

    expect(svc.getOrCreateLevel(tenantId, warehouseId, "prod-panela").on_hand_milli).toBe(33_000);
  });
});
