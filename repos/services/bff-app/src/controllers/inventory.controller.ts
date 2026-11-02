import type { InventoryService } from "@tiendita/inventory-service";
import type { HttpRequest, HttpResponse } from "../types.js";
import { requirePermission } from "../middlewares/gateway-security.js";

export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

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
    return {
      status: 201,
      headers: { "Content-Type": "application/json" },
      body: { received: receipts.length, receipts }
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
