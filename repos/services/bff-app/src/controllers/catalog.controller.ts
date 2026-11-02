import { validateBarcode } from "@tiendita/contracts";
import type { CatalogProductRecord, CatalogService } from "@tiendita/catalog-service";
import type { ShortReportCache } from "../cache/report-cache.js";
import type { HttpRequest, HttpResponse } from "../types.js";
import { requirePermission, requireStepUpMfa } from "../middlewares/gateway-security.js";

export class CatalogController {
  constructor(
    private readonly catalogService: CatalogService,
    private readonly reportCache: ShortReportCache
  ) {}

  async getProductByBarcode(barcode: string, req: HttpRequest): Promise<HttpResponse> {
    const claims = req.claims!;
    requirePermission(claims, "catalog.read");
    const product = [...this.catalogService.products.values()].find(
      (p) => p.tenant_id === claims.tid && p.barcodes.some((b) => b.barcode === barcode)
    );
    if (!product) {
      return {
        status: 404,
        headers: { "Content-Type": "application/json" },
        body: { error: "PRODUCT_NOT_FOUND" }
      };
    }
    return { status: 200, headers: { "Content-Type": "application/json" }, body: product };
  }

  async listProducts(req: HttpRequest): Promise<HttpResponse> {
    const claims = req.claims!;
    requirePermission(claims, "catalog.read");
    const list = [...this.catalogService.products.values()].filter(
      (p) => p.tenant_id === claims.tid
    );
    return { status: 200, headers: { "Content-Type": "application/json" }, body: list };
  }

  async createProduct(req: HttpRequest): Promise<HttpResponse> {
    const claims = req.claims!;
    requirePermission(claims, "catalog.manage");
    const body = (req.body as any) || {};
    if (body.barcode && !validateBarcode(body.barcode).valid) {
      return {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: { error: "INVALID_BARCODE" }
      };
    }
    const barcodes =
      body.barcodes || (body.barcode ? [{ barcode: body.barcode, pack_qty_milli: 1000 }] : []);
    const created = this.catalogService.createProduct({
      tenantId: claims.tid!,
      sku: body.sku || `SKU-${Date.now()}`,
      name: body.name,
      categoryId: body.categoryId ?? null,
      unit: body.unit ?? "UND",
      isWeighted: body.isWeighted ?? false,
      trackStock: body.trackStock ?? true,
      allowNegativeStock: body.allowNegativeStock ?? false,
      basePriceCents: body.basePriceCents ?? 0,
      costCents: body.costCents ?? 0,
      taxCodes: body.taxCodes ?? ["IVA_EXENTO"],
      barcodes
    });
    this.reportCache.invalidateTenant(claims.tid!);
    return { status: 201, headers: { "Content-Type": "application/json" }, body: created };
  }

  async patchProduct(productId: string, req: HttpRequest): Promise<HttpResponse> {
    const claims = req.claims!;
    requirePermission(claims, "catalog.manage");
    const { ifMatchVersion, patch } = (req.body as any) || {};
    const updated = this.catalogService.updateProductOptimistic({
      tenantId: claims.tid!,
      productId,
      ifMatchVersion: ifMatchVersion ?? 1,
      patch: patch || (req.body as any)
    });
    this.reportCache.invalidateTenant(claims.tid!);
    return { status: 200, headers: { "Content-Type": "application/json" }, body: updated };
  }

  async duplicateProduct(productId: string, req: HttpRequest): Promise<HttpResponse> {
    const claims = req.claims!;
    requirePermission(claims, "catalog.manage");
    const source = this.catalogService.products.get(productId);
    if (!source || source.tenant_id !== claims.tid) {
      return {
        status: 404,
        headers: { "Content-Type": "application/json" },
        body: { error: "PRODUCT_NOT_FOUND" }
      };
    }
    const { newName, newBarcode } = (req.body as any) || {};
    const cloned = this.catalogService.createProduct({
      tenantId: claims.tid!,
      sku: `${source.sku}-DUP-${Date.now()}`,
      name: newName || `${source.name} (Copia)`,
      categoryId: source.category_id,
      unit: source.unit,
      isWeighted: source.is_weighted,
      trackStock: source.track_stock,
      allowNegativeStock: source.allow_negative_stock,
      basePriceCents: source.base_price_cents,
      costCents: source.cost_cents,
      taxCodes: [...source.tax_codes],
      barcodes: newBarcode ? [{ barcode: newBarcode, pack_qty_milli: 1000 }] : []
    });
    return { status: 201, headers: { "Content-Type": "application/json" }, body: cloned };
  }

  async getExcelTemplate(): Promise<HttpResponse> {
    const template = {
      headers: ["sku", "name", "barcode", "cost_cents", "price_cents", "tax_rate", "category"],
      samples: [
        ["ARR-001", "Arroz Diana 1kg", "7702001001001", 380000, 480000, 0, "Granos"],
        ["ACE-002", "Aceite Premier 1000ml", "7702002002002", 900000, 1150000, 19, "Abarrotes"]
      ]
    };
    return { status: 200, headers: { "Content-Type": "application/json" }, body: template };
  }

  async convertGeneric(req: HttpRequest): Promise<HttpResponse> {
    const claims = req.claims!;
    requirePermission(claims, "catalog.manage");
    const { genericSaleId, sku, barcode } = (req.body as any) || {};
    const converted = this.catalogService.convertGenericItemToCatalogProduct({
      genericSaleId,
      sku,
      barcode
    });
    return { status: 201, headers: { "Content-Type": "application/json" }, body: converted };
  }

  async quickMarginCalc(req: HttpRequest): Promise<HttpResponse> {
    const { packCostCents, unitsPerPack, targetMarginRatio } = (req.body as any) || {};
    const units = unitsPerPack || 1;
    const unitCostCents = Math.round(packCostCents / units);
    const margin = targetMarginRatio || 0.2;
    const rawPriceCents = Math.round(unitCostCents / (1 - margin));
    const roundedPriceCents = Math.round(rawPriceCents / 5000) * 5000;
    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: {
        unitCostCents,
        suggestedPriceCents: roundedPriceCents,
        actualMarginRatio: (roundedPriceCents - unitCostCents) / roundedPriceCents
      }
    };
  }

  async bulkPriceUpdate(req: HttpRequest, nowMs: number): Promise<HttpResponse> {
    const claims = req.claims!;
    requirePermission(claims, "catalog.manage");
    requireStepUpMfa(claims, 300, nowMs);
    const { categoryId, percentDelta, fixedDeltaCents } = (req.body as any) || {};
    const updated: CatalogProductRecord[] = [];
    for (const prod of this.catalogService.products.values()) {
      if (prod.tenant_id === claims.tid && (!categoryId || prod.category_id === categoryId)) {
        let newPrice = prod.base_price_cents;
        if (percentDelta) {
          newPrice = Math.round(newPrice * (1 + percentDelta / 100));
        } else if (fixedDeltaCents) {
          newPrice += fixedDeltaCents;
        }
        newPrice = Math.round(newPrice / 5000) * 5000;
        const res = this.catalogService.updateProductOptimistic({
          tenantId: claims.tid!,
          productId: prod.id,
          ifMatchVersion: prod.version,
          patch: { base_price_cents: newPrice }
        });
        updated.push(res);
      }
    }
    this.reportCache.invalidateTenant(claims.tid!);
    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: { updatedCount: updated.length, products: updated }
    };
  }
}
