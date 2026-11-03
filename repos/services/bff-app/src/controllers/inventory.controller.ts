import type { InventoryService } from "@tiendita/inventory-service";
import type { CashService } from "@tiendita/cash-service";
import type { HttpRequest, HttpResponse } from "../types.js";
import { requirePermission } from "../middlewares/gateway-security.js";

export class InventoryController {
  constructor(private readonly inventoryService: InventoryService, private readonly cashService?: CashService) {}

  async applyPhysicalCounts(req: HttpRequest, nowMs: number): Promise<HttpResponse> {
    const claims = req.claims!;
    requirePermission(claims, "inventory.manage");
    const { warehouseId, counts, asOfMs } = (req.body as any) || {};
    const results = (counts || []).map((c: any) =>
      this.inventoryService.applyPhysicalCountAsOf({
        tenantId: claims.tid!,
        warehouseId,
        productId: c.productId,
        countedQtyMilli: c.countedQtyMilli,
        asOfMs: asOfMs ?? nowMs
      })
    );
    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: { counted: results.length, details: results }
    };
  }

  async recordPurchaseReceptions(req: HttpRequest, nowMs: number): Promise<HttpResponse> {
    const claims = req.claims!;
    requirePermission(claims, "inventory.manage");
        const { warehouseId, lines, paidFromCashSessionId } = (req.body as any) || {};
    const receipts = (lines || []).map((line: any) =>
      this.inventoryService.recordPurchaseReceipt({
        tenantId: claims.tid!,
        warehouseId,
        productId: line.productId,
        qtyMilli: line.qtyMilli,
        unitCostCents: line.unitCostCents,
        paidFromCashSessionId,
        occurredAtMs: nowMs
      })
    );

    // HU-304: Vincular egreso de efectivo al turno de caja si fue pagado de caja
    let cashMovementRecorded = false;
    if (paidFromCashSessionId && this.cashService) {
      const totalCostCents = (lines || []).reduce(
        (acc: number, l: any) => acc + Math.round(((l.qtyMilli ?? 0) * (l.unitCostCents ?? 0)) / 1000),
        0
      );
      if (totalCostCents > 0) {
        try {
          this.cashService.applyCashDeltaCents(paidFromCashSessionId, -totalCostCents);
          cashMovementRecorded = true;
        } catch {
          // Si el turno no está abierto en nube se ignora
        }
      }
    }

    return {
      status: 201,
      headers: { "Content-Type": "application/json" },
      body: { received: receipts.length, receipts, cashMovementRecorded }
    };
  }

  /**
   * HU-090 & HU-401: Ajustes de inventario por avería, merma o vencimiento con justificación obligatoria.
   */
  async recordAdjustment(req: HttpRequest, nowMs: number): Promise<HttpResponse> {
    const claims = req.claims!;
    requirePermission(claims, "inventory.manage");
    const { warehouseId, productId, kind, deltaMilli, reason } = (req.body as any) || {};

    if (!warehouseId || !productId || !kind) {
      return {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: { error: "MISSING_REQUIRED_FIELDS", message: "warehouseId, productId, and kind are required" }
      };
    }

    if (kind !== "ADJUSTMENT_EXPIRED" && kind !== "ADJUSTMENT_DAMAGED" && kind !== "ADJUSTMENT_SHRINKAGE") {
      return {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: { error: "INVALID_ADJUSTMENT_KIND", message: "kind must be ADJUSTMENT_EXPIRED, ADJUSTMENT_DAMAGED, or ADJUSTMENT_SHRINKAGE" }
      };
    }

    if (typeof deltaMilli !== "number" || deltaMilli === 0) {
      return {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: { error: "INVALID_DELTA", message: "deltaMilli must be a non-zero number" }
      };
    }

    if (!reason || typeof reason !== "string" || reason.trim().length < 3) {
      return {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: { error: "INVALID_REASON", message: "reason is required with minimum 3 characters" }
      };
    }

    try {
      const updatedLevel = this.inventoryService.recordInventoryAdjustment({
        tenantId: claims.tid!,
        warehouseId,
        productId,
        kind,
        deltaMilli,
        reason: reason.trim(),
        occurredAtMs: nowMs
      });

      return {
        status: 201,
        headers: { "Content-Type": "application/json" },
        body: {
          success: true,
          level: {
            productId: updatedLevel.product_id,
            warehouseId: updatedLevel.warehouse_id,
            onHandMilli: updatedLevel.on_hand_milli,
            avgCostCents: updatedLevel.avg_cost_cents
          }
        }
      };
    } catch (err: any) {
      return {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: { error: err.message || "ADJUSTMENT_FAILED" }
      };
    }
  }

  /**
   * HU-092 & HU-402: Despacho de traslados entre bodegas/sucursales.
   */
  async dispatchTransfer(req: HttpRequest, nowMs: number): Promise<HttpResponse> {
    const claims = req.claims!;
    requirePermission(claims, "inventory.manage");
    const { fromWarehouseId, toWarehouseId, productId, qtyMilli } = (req.body as any) || {};

    if (!fromWarehouseId || !toWarehouseId || !productId) {
      return {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: { error: "MISSING_REQUIRED_FIELDS", message: "fromWarehouseId, toWarehouseId, and productId are required" }
      };
    }

    if (fromWarehouseId === toWarehouseId) {
      return {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: { error: "SAME_WAREHOUSE", message: "fromWarehouseId and toWarehouseId must be different" }
      };
    }

    if (typeof qtyMilli !== "number" || qtyMilli <= 0) {
      return {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: { error: "INVALID_QUANTITY", message: "qtyMilli must be a positive number" }
      };
    }

    const transfer = this.inventoryService.dispatchWarehouseTransfer({
      tenantId: claims.tid!,
      fromWarehouseId,
      toWarehouseId,
      productId,
      qtyMilli,
      nowMs
    });

    return {
      status: 201,
      headers: { "Content-Type": "application/json" },
      body: {
        success: true,
        transfer: {
          id: transfer.id,
          fromWarehouseId: transfer.from_warehouse_id,
          toWarehouseId: transfer.to_warehouse_id,
          productId: transfer.product_id,
          sentQtyMilli: transfer.sent_qty_milli,
          status: transfer.status
        }
      }
    };
  }

  /**
   * HU-092: Recepción de traslado en bodega de destino con validación de diferencias.
   */
  async receiveTransfer(transferId: string, req: HttpRequest, nowMs: number): Promise<HttpResponse> {
    const claims = req.claims!;
    requirePermission(claims, "inventory.manage");
    const { receivedQtyMilli, diffNote } = (req.body as any) || {};

    if (typeof receivedQtyMilli !== "number" || receivedQtyMilli < 0) {
      return {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: { error: "INVALID_RECEIVED_QTY", message: "receivedQtyMilli must be a non-negative number" }
      };
    }

    try {
      const transfer = this.inventoryService.receiveWarehouseTransfer({
        transferId,
        receivedQtyMilli,
        diffNote,
        nowMs
      });

      return {
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: {
          success: true,
          transfer: {
            id: transfer.id,
            fromWarehouseId: transfer.from_warehouse_id,
            toWarehouseId: transfer.to_warehouse_id,
            productId: transfer.product_id,
            sentQtyMilli: transfer.sent_qty_milli,
            receivedQtyMilli: transfer.received_qty_milli,
            status: transfer.status,
            diffNote: transfer.diff_note
          }
        }
      };
    } catch (err: any) {
      return {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: { error: err.message || "RECEIVE_TRANSFER_FAILED" }
      };
    }
  }

  /**
   * HU-092 & HU-402: Listado de traslados entre bodegas.
   */
  async listTransfers(req: HttpRequest, queryParams: URLSearchParams): Promise<HttpResponse> {
    const claims = req.claims!;
    requirePermission(claims, "inventory.read");
    const tenantId = claims.tid!;
    const warehouseId = queryParams.get("warehouseId");

    const transfers = [...this.inventoryService.transfers.values()]
      .filter((t) => {
        if (t.tenant_id !== tenantId) return false;
        if (warehouseId && t.from_warehouse_id !== warehouseId && t.to_warehouse_id !== warehouseId) {
          return false;
        }
        return true;
      })
      .map((t) => ({
        id: t.id,
        fromWarehouseId: t.from_warehouse_id,
        toWarehouseId: t.to_warehouse_id,
        productId: t.product_id,
        sentQtyMilli: t.sent_qty_milli,
        receivedQtyMilli: t.received_qty_milli,
        status: t.status,
        diffNote: t.diff_note
      }));

    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: { count: transfers.length, items: transfers }
    };
  }

  /**
   * HU-447 & HU-229: Niveles de inventario con detección de bajo stock y costo promedio.
   */
  async getStockLevels(req: HttpRequest, queryParams: URLSearchParams): Promise<HttpResponse> {
    const claims = req.claims!;
    requirePermission(claims, "inventory.read");
    const tenantId = claims.tid!;
    const warehouseId = queryParams.get("warehouseId");

    const levels = [...this.inventoryService.stockLevels.values()]
      .filter((lvl) => {
        if (lvl.tenant_id !== tenantId) return false;
        if (warehouseId && lvl.warehouse_id !== warehouseId) return false;
        return true;
      })
      .map((lvl) => ({
        productId: lvl.product_id,
        warehouseId: lvl.warehouse_id,
        onHandMilli: lvl.on_hand_milli,
        minStockMilli: lvl.min_stock_milli,
        idealStockMilli: lvl.ideal_stock_milli,
        avgCostCents: lvl.avg_cost_cents,
        isLowStock: lvl.min_stock_milli > 0 && lvl.on_hand_milli <= lvl.min_stock_milli
      }));

    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: { count: levels.length, items: levels }
    };
  }

  /**
   * HU-304 & HU-356: Sugerencias automáticas de rebalanceo entre sucursales.
   */
  async getRebalancingSuggestions(req: HttpRequest): Promise<HttpResponse> {
    const claims = req.claims!;
    requirePermission(claims, "inventory.read");
    const tenantId = claims.tid!;
    const suggestions = this.inventoryService.getRebalancingSuggestions(tenantId);
    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: { count: suggestions.length, items: suggestions }
    };
  }

  /**
   * HU-089 & HU-400: Listado de proveedores del tenant.
   */
  async listSuppliers(req: HttpRequest): Promise<HttpResponse> {
    const claims = req.claims!;
    requirePermission(claims, "inventory.read");
    const items = this.inventoryService.listSuppliers(claims.tid!);
    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: { count: items.length, items }
    };
  }

  /**
   * HU-089 & HU-400: Crear o actualizar proveedor.
   */
  async upsertSupplier(req: HttpRequest, _nowMs: number): Promise<HttpResponse> {
    const claims = req.claims!;
    requirePermission(claims, "inventory.manage");
    const { supplierId, name, phone, visitDays, productIds } = (req.body as any) || {};

    if (!name || typeof name !== "string" || name.trim().length < 2) {
      return {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: { error: "MISSING_REQUIRED_FIELDS", message: "Supplier name is required" }
      };
    }

    const supplier = this.inventoryService.upsertSupplier({
      tenantId: claims.tid!,
      supplierId,
      name: name.trim(),
      phone: (phone || "").trim(),
      visitDays: Array.isArray(visitDays) ? visitDays : [1, 3, 5],
      productIds: Array.isArray(productIds) ? productIds : []
    });

    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: { success: true, supplier }
    };
  }

  /**
   * HU-191 & HU-400: Pedidos sugeridos a proveedores para preventistas (stock mínimo/máximo y WhatsApp).
   */
  async getSuggestedOrders(req: HttpRequest, queryParams: URLSearchParams): Promise<HttpResponse> {
    const claims = req.claims!;
    requirePermission(claims, "inventory.read");
    const warehouseId = queryParams.get("warehouseId") || "default-wh";
    const supplierId = queryParams.get("supplierId") || undefined;

    const suggestions = this.inventoryService.getSuggestedOrders({
      tenantId: claims.tid!,
      warehouseId,
      supplierId
    });

    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: { count: suggestions.length, items: suggestions }
    };
  }

  async getKardex(productId: string, req: HttpRequest): Promise<HttpResponse> {
    const claims = req.claims!;
    requirePermission(claims, "inventory.read");
    const movements = this.inventoryService.movements.filter(
      (m) => m.tenant_id === claims.tid && m.product_id === productId
    );
    return { status: 200, headers: { "Content-Type": "application/json" }, body: movements };
  }
}
