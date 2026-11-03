import { newId } from "@tiendita/contracts";

/**
 * ÉPICA 09 (FT-09.3) — inventory-service: Kardex por Deltas, Proveedores, Recepciones, Ajustes, Conteos y Traslados
 * Cubre: HU-088..HU-092, HU-191, HU-194, HU-280, HU-303, HU-304, HU-356, HU-400..HU-402, HU-447.
 */

export interface StockLevelRow {
  tenant_id: string;
  warehouse_id: string;
  product_id: string;
  on_hand_milli: number;
  avg_cost_cents: number;
  min_stock_milli: number;
  ideal_stock_milli: number;
}

export interface StockMovementRow {
  id: string;
  tenant_id: string;
  warehouse_id: string;
  product_id: string;
  kind:
    | "INITIAL_STOCK"
    | "SALE"
    | "RETURN"
    | "RECEIPT"
    | "ADJUSTMENT_EXPIRED"
    | "ADJUSTMENT_DAMAGED"
    | "ADJUSTMENT_SHRINKAGE"
    | "COUNT_CORRECTION"
    | "TRANSFER_OUT"
    | "TRANSFER_IN";
  delta_milli: number;
  unit_cost_cents: number | null;
  reason: string | null;
  paid_from_cash_session_id: string | null;
  batch_expiry_date: string | null;
  occurred_at_ms: number;
}


export interface SupplierRecord {
  id: string;
  tenant_id: string;
  name: string;
  phone: string;
  visit_days: number[]; // 1=Lunes .. 7=Domingo
  product_ids: string[];
}

export interface SuggestedOrderItem {
  productId: string;
  onHandMilli: number;
  minStockMilli: number;
  idealStockMilli: number;
  suggestedQtyMilli: number;
  avgCostCents: number;
  estimatedLineCostCents: number;
}

export interface SuggestedOrderProposal {
  supplierId: string;
  supplierName: string;
  supplierPhone: string;
  visitDays: number[];
  warehouseId: string;
  items: SuggestedOrderItem[];
  totalEstimatedCostCents: number;
  whatsappOrderText: string;
}

export interface WarehouseTransferRecord {
  id: string;
  tenant_id: string;
  from_warehouse_id: string;
  to_warehouse_id: string;
  product_id: string;
  sent_qty_milli: number;
  received_qty_milli: number | null;
  status: "IN_TRANSIT" | "RECEIVED" | "RECEIVED_WITH_DIFF";
  diff_note: string | null;
}

export class InventoryService {
  private readonly inboxProcessed = new Set<string>();
  public readonly stockLevels = new Map<string, StockLevelRow>(); // `${tenantId}:${warehouseId}:${productId}`
  public readonly movements: StockMovementRow[] = [];
  public readonly suppliers = new Map<string, SupplierRecord>();
  public readonly transfers = new Map<string, WarehouseTransferRecord>();
  public readonly publishedEvents: { topic: string; payload: unknown }[] = [];

  private key(tenantId: string, warehouseId: string, productId: string): string {
    return `${tenantId}:${warehouseId}:${productId}`;
  }

  getOrCreateLevel(tenantId: string, warehouseId: string, productId: string): StockLevelRow {
    const k = this.key(tenantId, warehouseId, productId);
    let row = this.stockLevels.get(k);
    if (!row) {
      row = {
        tenant_id: tenantId,
        warehouse_id: warehouseId,
        product_id: productId,
        on_hand_milli: 0,
        avg_cost_cents: 0,
        min_stock_milli: 0,
        ideal_stock_milli: 0
      };
      this.stockLevels.set(k, row);
    }
    return row;
  }

  /**
   * HU-447: Carga de inventario y costo inicial (`INITIAL_STOCK`).
   */
  recordInitialStock(params: {
    tenantId: string;
    warehouseId: string;
    productId: string;
    qtyMilli: number;
    unitCostCents: number;
    minStockMilli?: number;
    idealStockMilli?: number;
    occurredAtMs?: number;
  }): StockLevelRow {
    const nowMs = params.occurredAtMs ?? Date.now();
    const lvl = this.getOrCreateLevel(params.tenantId, params.warehouseId, params.productId);
    lvl.on_hand_milli += params.qtyMilli;
    lvl.avg_cost_cents = params.unitCostCents;
    if (params.minStockMilli !== undefined) lvl.min_stock_milli = params.minStockMilli;
    if (params.idealStockMilli !== undefined) lvl.ideal_stock_milli = params.idealStockMilli;

    this.movements.push({
      id: newId(nowMs),
      tenant_id: params.tenantId,
      warehouse_id: params.warehouseId,
      product_id: params.productId,
      kind: "INITIAL_STOCK",
      delta_milli: params.qtyMilli,
      unit_cost_cents: params.unitCostCents,
      reason: "Inventario Inicial",
      paid_from_cash_session_id: null,
      batch_expiry_date: null,
      occurred_at_ms: nowMs
    });
    return lvl;
  }

  /**
   * HU-088, HU-280 & HU-303: Suma algebraica conmutativa de deltas de venta/devolución,
   * ignorando productos con `track_stock = false` y emitiendo `inventory.negative_detected` si `on_hand < 0`.
   */
  applySaleOrReturnDelta(params: {
    eventId: string;
    tenantId: string;
    warehouseId: string;
    productId: string;
    trackStock: boolean;
    deltaMilli: number; // negativo para SALE, positivo para RETURN
    kind: "SALE" | "RETURN";
    occurredAtMs: number;
  }): { ignored: boolean; onHandMilli: number; negativeAlertEmitted: boolean } {
    const dedupKey = `${params.eventId}:${params.productId}`;
    const lvl = this.getOrCreateLevel(params.tenantId, params.warehouseId, params.productId);

    // HU-303: Ignorar productos con track_stock = false (genéricos, servicios, bolsas)
    if (!params.trackStock || this.inboxProcessed.has(dedupKey)) {
      return { ignored: true, onHandMilli: lvl.on_hand_milli, negativeAlertEmitted: false };
    }

    this.inboxProcessed.add(dedupKey);
    lvl.on_hand_milli += params.deltaMilli;
    this.movements.push({
      id: newId(params.occurredAtMs),
      tenant_id: params.tenantId,
      warehouse_id: params.warehouseId,
      product_id: params.productId,
      kind: params.kind,
      delta_milli: params.deltaMilli,
      unit_cost_cents: null,
      reason: null,
      paid_from_cash_session_id: null,
      batch_expiry_date: null,
      occurred_at_ms: params.occurredAtMs
    });

    const negativeAlertEmitted = lvl.on_hand_milli < 0;
    if (negativeAlertEmitted) {
      this.publishedEvents.push({
        topic: "inventory.events",
        payload: {
          type: "inventory.negative_detected",
          data: {
            tenant_id: params.tenantId,
            warehouse_id: params.warehouseId,
            product_id: params.productId,
            on_hand_milli: lvl.on_hand_milli
          }
        }
      });
    }
    return { ignored: false, onHandMilli: lvl.on_hand_milli, negativeAlertEmitted };
  }

  /**
   * HU-089, HU-304, HU-356 & HU-400: Recepción de mercancía recalculando el costo promedio ponderado (`avg_cost`),
   * enlazando pago desde caja (`paid_from_cash_session_id`) y guardando fecha de vencimiento de lote.
   */
  recordPurchaseReceipt(params: {
    tenantId: string;
    warehouseId: string;
    productId: string;
    qtyMilli: number;
    unitCostCents: number;
    paidFromCashSessionId?: string | null;
    batchExpiryDate?: string | null;
    occurredAtMs?: number;
  }): StockLevelRow {
    const nowMs = params.occurredAtMs ?? Date.now();
    const lvl = this.getOrCreateLevel(params.tenantId, params.warehouseId, params.productId);

    const prevPositiveMilli = Math.max(0, lvl.on_hand_milli);
    const newTotalMilli = prevPositiveMilli + params.qtyMilli;
    if (newTotalMilli > 0) {
      lvl.avg_cost_cents = Math.round(
        (prevPositiveMilli * lvl.avg_cost_cents + params.qtyMilli * params.unitCostCents) /
          newTotalMilli
      );
    }
    lvl.on_hand_milli += params.qtyMilli;

    this.movements.push({
      id: newId(nowMs),
      tenant_id: params.tenantId,
      warehouse_id: params.warehouseId,
      product_id: params.productId,
      kind: "RECEIPT",
      delta_milli: params.qtyMilli,
      unit_cost_cents: params.unitCostCents,
      reason: "Entrada de almacén",
      paid_from_cash_session_id: params.paidFromCashSessionId ?? null,
      batch_expiry_date: params.batchExpiryDate ?? null,
      occurred_at_ms: nowMs
    });
    return lvl;
  }

  /**
   * HU-090 & HU-401: Ajuste de inventario exigiendo cantidad distinta de cero y justificación.
   */
  recordInventoryAdjustment(params: {
    tenantId: string;
    warehouseId: string;
    productId: string;
    kind: "ADJUSTMENT_EXPIRED" | "ADJUSTMENT_DAMAGED" | "ADJUSTMENT_SHRINKAGE";
    deltaMilli: number;
    reason: string;
    occurredAtMs?: number;
  }): StockLevelRow {
    if (params.deltaMilli === 0 || !params.reason || params.reason.trim().length < 3) {
      throw new Error("400 VALIDATION_ERROR");
    }
    const nowMs = params.occurredAtMs ?? Date.now();
    const lvl = this.getOrCreateLevel(params.tenantId, params.warehouseId, params.productId);
    lvl.on_hand_milli += params.deltaMilli;
    this.movements.push({
      id: newId(nowMs),
      tenant_id: params.tenantId,
      warehouse_id: params.warehouseId,
      product_id: params.productId,
      kind: params.kind,
      delta_milli: params.deltaMilli,
      unit_cost_cents: lvl.avg_cost_cents,
      reason: params.reason.trim(),
      paid_from_cash_session_id: null,
      batch_expiry_date: null,
      occurred_at_ms: nowMs
    });
    return lvl;
  }

  /**
   * HU-091: Conteo físico calculando el delta contra el stock teórico al instante exacto del conteo (`asOfMs`),
   * sin pisar ventas ocurridas después de `asOfMs`.
   */
  applyPhysicalCountAsOf(params: {
    tenantId: string;
    warehouseId: string;
    productId: string;
    countedQtyMilli: number;
    asOfMs: number;
  }): { adjustmentDeltaMilli: number; finalOnHandMilli: number } {
    const theoreticalAtAsOfMilli = this.movements
      .filter(
        (m) =>
          m.tenant_id === params.tenantId &&
          m.warehouse_id === params.warehouseId &&
          m.product_id === params.productId &&
          m.occurred_at_ms <= params.asOfMs
      )
      .reduce((acc, m) => acc + m.delta_milli, 0);

    const adjustmentDeltaMilli = params.countedQtyMilli - theoreticalAtAsOfMilli;
    const lvl = this.getOrCreateLevel(params.tenantId, params.warehouseId, params.productId);
    lvl.on_hand_milli += adjustmentDeltaMilli;

    this.movements.push({
      id: newId(params.asOfMs),
      tenant_id: params.tenantId,
      warehouse_id: params.warehouseId,
      product_id: params.productId,
      kind: "COUNT_CORRECTION",
      delta_milli: adjustmentDeltaMilli,
      unit_cost_cents: lvl.avg_cost_cents,
      reason: `Conteo físico as_of=${params.asOfMs}`,
      paid_from_cash_session_id: null,
      batch_expiry_date: null,
      occurred_at_ms: params.asOfMs
    });

    return {
      adjustmentDeltaMilli,
      finalOnHandMilli: lvl.on_hand_milli
    };
  }

  /**
   * HU-092 & HU-402: Traslados entre bodegas/sucursales (`IN_TRANSIT` -> `RECEIVED` / `RECEIVED_WITH_DIFF`).
   */
  dispatchWarehouseTransfer(params: {
    tenantId: string;
    fromWarehouseId: string;
    toWarehouseId: string;
    productId: string;
    qtyMilli: number;
    nowMs?: number;
  }): WarehouseTransferRecord {
    const nowMs = params.nowMs ?? Date.now();
    const originLvl = this.getOrCreateLevel(params.tenantId, params.fromWarehouseId, params.productId);
    originLvl.on_hand_milli -= params.qtyMilli;

    this.movements.push({
      id: newId(nowMs),
      tenant_id: params.tenantId,
      warehouse_id: params.fromWarehouseId,
      product_id: params.productId,
      kind: "TRANSFER_OUT",
      delta_milli: -params.qtyMilli,
      unit_cost_cents: originLvl.avg_cost_cents,
      reason: `Traslado a ${params.toWarehouseId}`,
      paid_from_cash_session_id: null,
      batch_expiry_date: null,
      occurred_at_ms: nowMs
    });

    const tr: WarehouseTransferRecord = {
      id: newId(nowMs),
      tenant_id: params.tenantId,
      from_warehouse_id: params.fromWarehouseId,
      to_warehouse_id: params.toWarehouseId,
      product_id: params.productId,
      sent_qty_milli: params.qtyMilli,
      received_qty_milli: null,
      status: "IN_TRANSIT",
      diff_note: null
    };
    this.transfers.set(tr.id, tr);
    return tr;
  }

  receiveWarehouseTransfer(params: {
    transferId: string;
    receivedQtyMilli: number;
    diffNote?: string;
    nowMs?: number;
  }): WarehouseTransferRecord {
    const nowMs = params.nowMs ?? Date.now();
    const tr = this.transfers.get(params.transferId);
    if (!tr || tr.status !== "IN_TRANSIT") throw new Error("TRANSFER_NOT_IN_TRANSIT");

    const destLvl = this.getOrCreateLevel(tr.tenant_id, tr.to_warehouse_id, tr.product_id);
    destLvl.on_hand_milli += params.receivedQtyMilli;

    this.movements.push({
      id: newId(nowMs),
      tenant_id: tr.tenant_id,
      warehouse_id: tr.to_warehouse_id,
      product_id: tr.product_id,
      kind: "TRANSFER_IN",
      delta_milli: params.receivedQtyMilli,
      unit_cost_cents: null,
      reason: `Recepción traslado ${tr.id}`,
      paid_from_cash_session_id: null,
      batch_expiry_date: null,
      occurred_at_ms: nowMs
    });

    tr.received_qty_milli = params.receivedQtyMilli;
    tr.status = params.receivedQtyMilli === tr.sent_qty_milli ? "RECEIVED" : "RECEIVED_WITH_DIFF";
    tr.diff_note = params.diffNote ?? null;
    return tr;
  }

  /**
   * HU-194: Reconstrucción total de `stock_levels` a partir de la tabla inmutable `stock_movements`.
   */
  /**
   * HU-304 & HU-356: Sugerencias de rebalanceo de stock entre bodegas/sucursales.
   * Identifica sedes donde el inventario cayó por debajo del mínimo (min_stock_milli)
   * y busca bodegas del mismo tenant con excedentes disponibles.
   */
  getRebalancingSuggestions(tenantId: string): Array<{
    productId: string;
    fromWarehouseId: string;
    toWarehouseId: string;
    deficitQtyMilli: number;
    availableSurplusMilli: number;
    suggestedQtyMilli: number;
    priority: "CRITICAL" | "MODERATE";
  }> {
    const suggestions: Array<{
      productId: string;
      fromWarehouseId: string;
      toWarehouseId: string;
      deficitQtyMilli: number;
      availableSurplusMilli: number;
      suggestedQtyMilli: number;
      priority: "CRITICAL" | "MODERATE";
    }> = [];
    const tenantLevels = [...this.stockLevels.values()].filter((l) => l.tenant_id === tenantId);

    const levelsByProduct = new Map<string, StockLevelRow[]>();
    for (const lvl of tenantLevels) {
      const arr = levelsByProduct.get(lvl.product_id) ?? [];
      arr.push(lvl);
      levelsByProduct.set(lvl.product_id, arr);
    }

    for (const [productId, levels] of levelsByProduct.entries()) {
      const deficitWarehouses = levels.filter((l) => l.min_stock_milli > 0 && l.on_hand_milli <= l.min_stock_milli);
      const surplusWarehouses = levels.filter((l) => l.on_hand_milli > l.min_stock_milli);

      for (const def of deficitWarehouses) {
        const neededQty = (def.ideal_stock_milli > 0 ? def.ideal_stock_milli : def.min_stock_milli * 2) - def.on_hand_milli;
        const bestSource = [...surplusWarehouses].sort(
          (a, b) => (b.on_hand_milli - b.min_stock_milli) - (a.on_hand_milli - a.min_stock_milli)
        )[0];
        if (bestSource && bestSource.warehouse_id !== def.warehouse_id) {
          const surplus = bestSource.on_hand_milli - bestSource.min_stock_milli;
          if (surplus > 0) {
            const suggestedQty = Math.min(surplus, Math.max(1000, neededQty));
            suggestions.push({
              productId,
              fromWarehouseId: bestSource.warehouse_id,
              toWarehouseId: def.warehouse_id,
              deficitQtyMilli: Math.max(0, def.min_stock_milli - def.on_hand_milli),
              availableSurplusMilli: surplus,
              suggestedQtyMilli: suggestedQty,
              priority: def.on_hand_milli <= 0 ? "CRITICAL" : "MODERATE"
            });
          }
        }
      }
    }

    return suggestions;
  }


  /**
   * HU-089 & HU-400: Registro y actualización de proveedores.
   */
  upsertSupplier(params: {
    tenantId: string;
    supplierId?: string;
    name: string;
    phone: string;
    visitDays?: number[];
    productIds?: string[];
  }): SupplierRecord {
    const id = params.supplierId || newId();
    const rec: SupplierRecord = {
      id,
      tenant_id: params.tenantId,
      name: params.name,
      phone: params.phone,
      visit_days: params.visitDays ?? [1, 3, 5],
      product_ids: params.productIds ?? []
    };
    this.suppliers.set(id, rec);
    return rec;
  }

  listSuppliers(tenantId: string): SupplierRecord[] {
    return [...this.suppliers.values()].filter((s) => s.tenant_id === tenantId);
  }

  /**
   * HU-191 & HU-400: Pedidos sugeridos a proveedores según stock mínimo/máximo y días de visita (Preventa).
   */
  getSuggestedOrders(params: {
    tenantId: string;
    warehouseId: string;
    supplierId?: string;
  }): SuggestedOrderProposal[] {
    const proposals: SuggestedOrderProposal[] = [];
    const targetSuppliers = [...this.suppliers.values()].filter((s) => {
      if (s.tenant_id !== params.tenantId) return false;
      if (params.supplierId && s.id !== params.supplierId) return false;
      return true;
    });

    for (const sup of targetSuppliers) {
      const items: SuggestedOrderItem[] = [];
      for (const prodId of sup.product_ids) {
        const lvl = this.getOrCreateLevel(params.tenantId, params.warehouseId, prodId);
        if (lvl.min_stock_milli > 0 && lvl.on_hand_milli <= lvl.min_stock_milli) {
          const targetQty = (lvl.ideal_stock_milli > 0 ? lvl.ideal_stock_milli : lvl.min_stock_milli * 2);
          const deficit = targetQty - lvl.on_hand_milli;
          const suggestedQtyMilli = Math.max(1000, deficit);
          const estimatedLineCostCents = Math.round((suggestedQtyMilli * lvl.avg_cost_cents) / 1000);

          items.push({
            productId: prodId,
            onHandMilli: lvl.on_hand_milli,
            minStockMilli: lvl.min_stock_milli,
            idealStockMilli: lvl.ideal_stock_milli,
            suggestedQtyMilli,
            avgCostCents: lvl.avg_cost_cents,
            estimatedLineCostCents
          });
        }
      }

      if (items.length > 0) {
        const totalEstimatedCostCents = items.reduce((acc, it) => acc + it.estimatedLineCostCents, 0);
        const orderLinesText = items
          .map((it) => `- Ítem ${it.productId}: ${it.suggestedQtyMilli / 1000} und (${Math.round(it.estimatedLineCostCents / 100).toLocaleString("es-CO")} COP)`)
          .join("\n");
        const whatsappOrderText =
          `Hola ${sup.name}, pedido sugerido de Tiendita:\n` +
          orderLinesText +
          `\nTotal estimado: ${Math.round(totalEstimatedCostCents / 100).toLocaleString("es-CO")} COP`;

        proposals.push({
          supplierId: sup.id,
          supplierName: sup.name,
          supplierPhone: sup.phone,
          visitDays: sup.visit_days,
          warehouseId: params.warehouseId,
          items,
          totalEstimatedCostCents,
          whatsappOrderText
        });
      }
    }

    return proposals;
  }

  rebuildStockLevelsFromMovements(tenantId: string): void {
    for (const lvl of this.stockLevels.values()) {
      if (lvl.tenant_id === tenantId) {
        lvl.on_hand_milli = 0;
      }
    }
    for (const m of this.movements) {
      if (m.tenant_id === tenantId) {
        const lvl = this.getOrCreateLevel(m.tenant_id, m.warehouse_id, m.product_id);
        lvl.on_hand_milli += m.delta_milli;
      }
    }
  }
}
