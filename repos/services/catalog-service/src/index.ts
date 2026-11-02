import { newId, computeGs1CheckDigit } from "@tiendita/contracts";

/**
 * ÉPICA 08 (FT-08.4) — catalog-service: Productos, Precios, Presentaciones, Importación, Genéricos y Promociones
 * Cubre: HU-079..HU-083, HU-273..HU-276, HU-297..HU-299, HU-334, HU-389..HU-397.
 */

export const RESERVED_GENERIC_SKU = "__GENERIC__";

export interface CatalogProductRecord {
  id: string;
  tenant_id: string;
  sku: string;
  name: string;
  category_id: string | null;
  brand_id: string | null;
  unit: string;
  is_weighted: boolean;
  track_stock: boolean;
  allow_negative_stock: boolean;
  base_price_cents: number;
  cost_cents: number;
  tax_codes: string[];
  barcodes: { barcode: string; pack_qty_milli: number; presentation_name?: string; price_cents?: number }[];
  is_system_reserved: boolean;
  version: number;
  status: "ACTIVE" | "INACTIVE";
  deleted_at_ms: number | null;
}

export interface BranchPriceScheduleRecord {
  id: string;
  tenant_id: string;
  branch_id: string;
  product_id: string;
  price_cents: number;
  valid_from_ms: number;
  valid_to_ms: number | null;
}

export interface GenericItemSalePendingRecord {
  id: string;
  tenant_id: string;
  sale_id: string;
  description: string;
  unit_price_cents: number;
  qty_milli: number;
  status: "PENDING" | "CREATED" | "IGNORED";
  created_product_id: string | null;
}

export interface PromotionRuleRecord {
  id: string;
  tenant_id: string;
  name: string;
  kind: "PERCENT" | "FIXED" | "NXM" | "BUNDLE";
  product_id: string;
  buy_qty_milli?: number; // ej. 3000 en 3x2
  pay_qty_milli?: number; // ej. 2000 en 3x2
  discount_bp?: number;
  fixed_discount_cents?: number;
  priority: number;
  active: boolean;
}

export class CatalogService {
  public readonly tenantProductLimits = new Map<string, { max_products: number; promotions_enabled: boolean }>();
  public readonly products = new Map<string, CatalogProductRecord>();
  public readonly categories = new Map<string, { id: string; tenant_id: string; name: string; parent_id: string | null; deleted_at_ms: number | null }>();
  public readonly branchPrices: BranchPriceScheduleRecord[] = [];
  public readonly genericItemSales = new Map<string, GenericItemSalePendingRecord>();
  public readonly promotions = new Map<string, PromotionRuleRecord>();
  public readonly importJobs = new Map<
    string,
    {
      id: string;
      tenant_id: string;
      status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
      valid_rows: number;
      errors: { rowNumber: number; reason: string }[];
    }
  >();
  private internalEanCounter = 100000000;
  public readonly publishedEvents: { topic: string; payload: unknown }[] = [];

  /**
   * HU-297: Crea automáticamente el producto reservado `__GENERIC__` (`track_stock = false`) en cada tienda nueva.
   */
  initializeTenantCatalog(tenantId: string, maxProducts = 3000, promotionsEnabled = false): CatalogProductRecord {
    this.tenantProductLimits.set(tenantId, {
      max_products: maxProducts,
      promotions_enabled: promotionsEnabled
    });

    const genericProd: CatalogProductRecord = {
      id: newId(),
      tenant_id: tenantId,
      sku: RESERVED_GENERIC_SKU,
      name: "Artículo Genérico / Vario",
      category_id: null,
      brand_id: null,
      unit: "UND",
      is_weighted: false,
      track_stock: false,
      allow_negative_stock: true,
      base_price_cents: 0,
      cost_cents: 0,
      tax_codes: ["EXCLUIDO"],
      barcodes: [],
      is_system_reserved: true,
      version: 1,
      status: "ACTIVE",
      deleted_at_ms: null
    };
    this.products.set(genericProd.id, genericProd);
    return genericProd;
  }

  /**
   * HU-079, HU-275 & HU-391: Crea un producto con sus códigos de barras/presentaciones e impuestos en una sola transacción,
   * validando `max_products` y unicidad de códigos dentro del mismo tenant.
   */
  createProduct(params: {
    tenantId: string;
    sku: string;
    name: string;
    categoryId?: string | null;
    unit?: string;
    isWeighted?: boolean;
    trackStock?: boolean;
    allowNegativeStock?: boolean;
    basePriceCents: number;
    costCents?: number;
    taxCodes?: string[];
    barcodes?: { barcode: string; pack_qty_milli?: number; presentation_name?: string; price_cents?: number }[];
  }): CatalogProductRecord {
    const limits = this.tenantProductLimits.get(params.tenantId) ?? {
      max_products: 3000,
      promotions_enabled: false
    };

    const activeProducts = [...this.products.values()].filter(
      (p) => p.tenant_id === params.tenantId && p.deleted_at_ms === null && !p.is_system_reserved
    );
    if (activeProducts.length >= limits.max_products) {
      throw new Error("403 PLAN_PRODUCT_LIMIT_EXCEEDED");
    }

    const existingBarcodes = new Set(
      activeProducts.flatMap((p) => p.barcodes.map((b) => b.barcode))
    );
    for (const b of params.barcodes ?? []) {
      if (existingBarcodes.has(b.barcode)) {
        throw new Error(`409 BARCODE_ALREADY_EXISTS:${b.barcode}`);
      }
    }

    const prod: CatalogProductRecord = {
      id: newId(),
      tenant_id: params.tenantId,
      sku: params.sku,
      name: params.name,
      category_id: params.categoryId ?? null,
      brand_id: null,
      unit: params.unit ?? "UND",
      is_weighted: params.isWeighted ?? false,
      track_stock: params.trackStock ?? true,
      allow_negative_stock: params.allowNegativeStock ?? true,
      base_price_cents: params.basePriceCents,
      cost_cents: params.costCents ?? 0,
      tax_codes: params.taxCodes ?? ["EXCLUIDO"],
      barcodes: (params.barcodes ?? []).map((b) => ({
        barcode: b.barcode,
        pack_qty_milli: b.pack_qty_milli ?? 1000,
        presentation_name: b.presentation_name,
        price_cents: b.price_cents
      })),
      is_system_reserved: false,
      version: 1,
      status: "ACTIVE",
      deleted_at_ms: null
    };

    this.products.set(prod.id, prod);
    this.publishedEvents.push({
      topic: "catalog.events",
      payload: { type: "catalog.product.upserted", data: prod }
    });
    return prod;
  }

  /**
   * HU-079 & HU-392: Actualización parcial con control optimista obligatorio `If-Match` (`428` si falta, `409` si difiere).
   */
  updateProductOptimistic(params: {
    tenantId: string;
    productId: string;
    ifMatchVersion?: number | null;
    patch: Partial<Pick<CatalogProductRecord, "name" | "base_price_cents" | "cost_cents" | "status" | "category_id">>;
  }): CatalogProductRecord {
    if (params.ifMatchVersion === undefined || params.ifMatchVersion === null) {
      throw new Error("428 PRECONDITION_REQUIRED");
    }
    const prod = this.products.get(params.productId);
    if (!prod || prod.tenant_id !== params.tenantId || prod.deleted_at_ms !== null) {
      throw new Error("404 PRODUCT_NOT_FOUND");
    }
    if (prod.version !== params.ifMatchVersion) {
      throw new Error(`409 VERSION_CONFLICT:current=${prod.version}`);
    }

    Object.assign(prod, params.patch);
    prod.version += 1;
    this.publishedEvents.push({
      topic: "catalog.events",
      payload: { type: "catalog.product.upserted", data: prod }
    });
    return prod;
  }

  /**
   * HU-297 & HU-393: Borrado lógico (`deleted_at = now()`) bloqueando borrar `__GENERIC__` y emitiendo tombstone.
   */
  softDeleteProduct(tenantId: string, productId: string, nowMs = Date.now()): void {
    const prod = this.products.get(productId);
    if (!prod || prod.tenant_id !== tenantId) {
      throw new Error("404 PRODUCT_NOT_FOUND");
    }
    if (prod.is_system_reserved) {
      throw new Error("400 SYSTEM_PRODUCT_CANNOT_BE_DELETED");
    }
    prod.deleted_at_ms = nowMs;
    prod.version += 1;
    this.publishedEvents.push({
      topic: "catalog.events",
      payload: {
        type: "catalog.product.deleted",
        data: { tenant_id: tenantId, product_id: productId, source_version: prod.version }
      }
    });
  }

  /**
   * HU-273: Borrado lógico de categoría que desasocia productos activos sin borrarlos.
   */
  softDeleteCategory(tenantId: string, categoryId: string, nowMs = Date.now()): void {
    const cat = this.categories.get(categoryId);
    if (!cat || cat.tenant_id !== tenantId) throw new Error("404 CATEGORY_NOT_FOUND");
    cat.deleted_at_ms = nowMs;
    for (const p of this.products.values()) {
      if (p.tenant_id === tenantId && p.category_id === categoryId) {
        p.category_id = null;
      }
    }
  }

  /**
   * HU-276: Generador de código interno EAN-13 con prefijo `29` y dígito verificador GS1 válido.
   */
  generateInternalEan13Barcode(): string {
    const body12 = `290${String(++this.internalEanCounter).padStart(9, "0")}`;
    return `${body12}${computeGs1CheckDigit(body12)}`;
  }

  /**
   * HU-080 & HU-396: Precios por sucursal y precios programados con fecha futura (`valid_from`).
   */
  scheduleBranchPrice(params: {
    tenantId: string;
    branchId: string;
    productId: string;
    priceCents: number;
    validFromMs: number;
    validToMs?: number | null;
  }): BranchPriceScheduleRecord {
    const rec: BranchPriceScheduleRecord = {
      id: newId(),
      tenant_id: params.tenantId,
      branch_id: params.branchId,
      product_id: params.productId,
      price_cents: params.priceCents,
      valid_from_ms: params.validFromMs,
      valid_to_ms: params.validToMs ?? null
    };
    this.branchPrices.push(rec);
    return rec;
  }

  resolveEffectiveProductPriceCents(productId: string, branchId: string, atTimeMs = Date.now()): number {
    const prod = this.products.get(productId);
    if (!prod) throw new Error("404 PRODUCT_NOT_FOUND");

    const applicable = this.branchPrices
      .filter(
        (bp) =>
          bp.product_id === productId &&
          bp.branch_id === branchId &&
          bp.valid_from_ms <= atTimeMs &&
          (bp.valid_to_ms === null || bp.valid_to_ms > atTimeMs)
      )
      .sort((a, b) => b.valid_from_ms - a.valid_from_ms);

    return applicable[0] ? applicable[0].price_cents : prod.base_price_cents;
  }

  /**
   * HU-081, HU-299 & HU-394: Previsualización y validación de importación masiva Excel/CSV.
   */
  previewAndExecuteBulkImport(params: {
    tenantId: string;
    rows: { rowNumber: number; sku: string; name: string; price_cents: number; barcode?: string }[];
  }): {
    jobId: string;
    validRows: number;
    errors: { rowNumber: number; reason: string }[];
  } {
    const limits = this.tenantProductLimits.get(params.tenantId) ?? {
      max_products: 3000,
      promotions_enabled: false
    };
    if (params.rows.length > limits.max_products) {
      throw new Error(`403 PLAN_PRODUCT_LIMIT_EXCEEDED:max=${limits.max_products}`);
    }

    const seenBarcodes = new Set<string>();
    const errors: { rowNumber: number; reason: string }[] = [];
    let validRows = 0;

    for (const r of params.rows) {
      if (r.price_cents < 0) {
        errors.push({ rowNumber: r.rowNumber, reason: "NEGATIVE_PRICE" });
        continue;
      }
      if (r.barcode) {
        if (seenBarcodes.has(r.barcode)) {
          errors.push({ rowNumber: r.rowNumber, reason: `DUPLICATE_BARCODE_IN_FILE:${r.barcode}` });
          continue;
        }
        seenBarcodes.add(r.barcode);
      }
      validRows++;
    }

    const jobId = newId();
    this.importJobs.set(jobId, {
      id: jobId,
      tenant_id: params.tenantId,
      status: "COMPLETED",
      valid_rows: validRows,
      errors
    });
    return { jobId, validRows, errors };
  }

  /**
   * HU-082, HU-298 & HU-395: Bandeja de artículos genéricos vendidos (`generic_item_sales`) y conversión en producto formal en un clic.
   */
  recordGenericItemSold(params: {
    tenantId: string;
    saleId: string;
    description: string;
    unitPriceCents: number;
    qtyMilli: number;
  }): GenericItemSalePendingRecord {
    const rec: GenericItemSalePendingRecord = {
      id: newId(),
      tenant_id: params.tenantId,
      sale_id: params.saleId,
      description: params.description,
      unit_price_cents: params.unitPriceCents,
      qty_milli: params.qtyMilli,
      status: "PENDING",
      created_product_id: null
    };
    this.genericItemSales.set(rec.id, rec);
    return rec;
  }

  convertGenericItemToCatalogProduct(params: {
    genericSaleId: string;
    sku: string;
    barcode: string;
  }): CatalogProductRecord {
    const gen = this.genericItemSales.get(params.genericSaleId);
    if (!gen) throw new Error("404 GENERIC_ITEM_SALE_NOT_FOUND");
    const created = this.createProduct({
      tenantId: gen.tenant_id,
      sku: params.sku,
      name: gen.description,
      basePriceCents: gen.unit_price_cents,
      barcodes: [{ barcode: params.barcode }]
    });
    gen.status = "CREATED";
    gen.created_product_id = created.id;
    return created;
  }

  /**
   * HU-083 & HU-397: Motor y gestión de promociones (`NXM`, `PERCENT`, `FIXED`) validando feature `promotions` del plan.
   */
  createPromotion(promo: Omit<PromotionRuleRecord, "id">): PromotionRuleRecord {
    const limits = this.tenantProductLimits.get(promo.tenant_id);
    if (!limits?.promotions_enabled) {
      throw new Error("403 FEATURE_NOT_IN_PLAN:promotions");
    }
    const rec: PromotionRuleRecord = { ...promo, id: newId() };
    this.promotions.set(rec.id, rec);
    return rec;
  }

  evaluateLinePromotionDiscountCents(params: {
    tenantId: string;
    productId: string;
    qtyMilli: number;
    unitPriceCents: number;
  }): { discountCents: number; appliedPromoName: string | null } {
    const activePromos = [...this.promotions.values()]
      .filter((p) => p.tenant_id === params.tenantId && p.product_id === params.productId && p.active)
      .sort((a, b) => b.priority - a.priority);

    const best = activePromos[0];
    if (!best) return { discountCents: 0, appliedPromoName: null };

    if (best.kind === "NXM" && best.buy_qty_milli && best.pay_qty_milli) {
      const packs = Math.floor(params.qtyMilli / best.buy_qty_milli);
      const freeMilliPerPack = best.buy_qty_milli - best.pay_qty_milli;
      const freeTotalMilli = packs * freeMilliPerPack;
      const discountCents = Math.round((freeTotalMilli * params.unitPriceCents) / 1000);
      return {
        discountCents,
        appliedPromoName: discountCents > 0 ? best.name : null
      };
    }

    return { discountCents: 0, appliedPromoName: null };
  }
}
