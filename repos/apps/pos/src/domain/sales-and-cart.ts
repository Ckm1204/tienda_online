import {
  newId,
  canonicalSha256,
  validateBarcode,
  SaleCompletedV1Schema,
  SaleVoidedV1Schema,
  SaleReturnedV1Schema
} from "@tiendita/contracts";
import {
  calculateCartTotals,
  TaxDefinition,
  CalculatedCartTotals
} from "@tiendita/tax-engine";
import { EncryptedPosStorage } from "../storage/local-db.js";
import { PosSecurityAndAuthKernel } from "../security/device-auth-and-audit.js";
import { PosCashSessionManager } from "../cash/shifts-and-blind-count.js";
import {
  PosCustomersAndCreditManager,
  normalizeSearchText
} from "../customers/credit-and-fiados.js";
import { EscPosPrinterAndPeripherals } from "../devices/escpos-and-peripherals.js";

/**
 * ÉPICA 03 (FT-03.1..FT-03.5) — Ventas, Carrito, Precios, Medios de Pago y Devoluciones (Offline)
 */

export const SYSTEM_GENERIC_PRODUCT_ID = "00000000-0000-7000-8000-000000000001";

export interface LocalProductRow {
  id: string;
  sku: string;
  name: string;
  category_id: string | null;
  unit: string;
  is_weighted: boolean;
  track_stock: boolean;
  allow_negative_stock: boolean;
  taxes: TaxDefinition[];
  price_cents: number;
  returnable_bottle_product_id?: string | null;
  returnable_deposit_cents?: number | null;
  status: "ACTIVE" | "INACTIVE";
  deleted: boolean;
}

export interface LocalBarcodeRow {
  barcode: string;
  product_id: string;
  pack_qty_milli: number;
  deleted: boolean;
}

export interface CartItemDraft {
  line_id: string;
  product_id: string;
  description: string;
  qty_milli: number;
  unit_price_cents: number;
  discount_cents: number;
  taxes: TaxDefinition[];
  is_generic_item: boolean;
  note?: string;
}

export interface ParkedCartRow {
  id: string;
  cashier_id: string;
  label: string;
  items: CartItemDraft[];
  created_at_ms: number;
}

export interface LocalSaleRecord {
  id: string;
  cart_id: string;
  cash_session_id: string;
  cashier_id: string;
  customer_id: string | null;
  receipt_prefix: string;
  receipt_number: number;
  receipt_code: string;
  status: "COMPLETED" | "VOIDED" | "PARTIALLY_RETURNED" | "RETURNED";
  totals: CalculatedCartTotals;
  payments: {
    payment_id: string;
    method: "CASH" | "DEBIT" | "CREDIT_CARD" | "NEQUI" | "DAVIPLATA" | "BRE_B" | "TRANSFER" | "CREDIT_ACCOUNT";
    amount_cents: number;
    tendered_cents: number | null;
    change_cents: number | null;
    reference: string | null;
  }[];
  is_credit: boolean;
  issued_at_ms: number;
}

export interface LocalSaleReturnRecord {
  id: string;
  original_sale_id: string | null;
  manual_receipt_ref: string | null;
  kind: "VOID" | "PARTIAL_RETURN" | "FULL_RETURN";
  reason: string;
  approved_by: string;
  lines: { product_id: string; qty_milli: number; refund_line_cents: number }[];
  refund_total_cents: number;
  refund_method: string;
  cash_session_id: string;
  occurred_at_ms: number;
}

export class PosSalesAndCartEngine {
  public readonly products = new Map<string, LocalProductRow>();
  public readonly barcodes = new Map<string, LocalBarcodeRow>();
  public readonly stockSnapshotMilli = new Map<string, number>();
  public readonly localStockMovements: {
    id: string;
    product_id: string;
    qty_milli: number;
    kind: string;
    source_id: string;
    occurred_at_ms: number;
    synced: boolean;
  }[] = [];
  public readonly parkedCarts = new Map<string, ParkedCartRow>();
  public readonly sales = new Map<string, LocalSaleRecord>();
  private readonly salesByCartId = new Map<string, LocalSaleRecord>();
  public readonly saleReturns: LocalSaleReturnRecord[] = [];

  public maxCashierFreeDiscountBp = 500; // 5 % sin aprobación
  public returnPolicyMaxDays = 8;
  public isPracticeMode = false;

  constructor(
    private readonly storage: EncryptedPosStorage,
    private readonly auth: PosSecurityAndAuthKernel,
    private readonly cash: PosCashSessionManager,
    private readonly customers: PosCustomersAndCreditManager,
    private readonly printer: EscPosPrinterAndPeripherals
  ) {}

  upsertProduct(product: LocalProductRow, codes: { barcode: string; pack_qty_milli?: number }[] = []): void {
    this.products.set(product.id, { ...product });
    for (const c of codes) {
      this.barcodes.set(c.barcode, {
        barcode: c.barcode,
        product_id: product.id,
        pack_qty_milli: c.pack_qty_milli ?? 1000,
        deleted: product.deleted
      });
    }
  }

  getEstimatedStockMilli(productId: string): number {
    const snap = this.stockSnapshotMilli.get(productId) ?? 0;
    const localDelta = this.localStockMovements
      .filter((m) => m.product_id === productId && !m.synced)
      .reduce((acc, m) => acc + m.qty_milli, 0);
    return snap + localDelta;
  }

  /**
   * HU-169: Interpreta el prefijo multiplicador `6*7702004003509` -> `{ multiplier: 6, barcode: '7702004003509' }`.
   */
  parseScanInputWithMultiplier(rawInput: string): { multiplier: number; code: string } {
    const m = rawInput.trim().match(/^(\d+)\s*\*\s*(.+)$/);
    if (m?.[1] && m[2]) {
      const mult = parseInt(m[1], 10);
      if (mult > 0 && mult <= 9999) {
        return { multiplier: mult, code: m[2].trim() };
      }
    }
    return { multiplier: 1, code: rawInput.trim() };
  }

  /**
   * HU-033, HU-036, HU-037, HU-171, HU-173 & HU-210:
   * Resuelve código exacto, código de empaque (`pack_qty_milli`) o código EAN-13 de balanza
   * (prefijo `20` con peso en gramos o `21` con valor total en pesos COP).
   */
  cmdLookupBarcode(rawScan: string): {
    product: LocalProductRow;
    qtyMilli: number;
    unitPriceCents: number;
  } {
    const { multiplier, code } = this.parseScanInputWithMultiplier(rawScan);

    // 1. Prioridad: código exacto en product_barcodes
    const exact = this.barcodes.get(code);
    if (exact && !exact.deleted) {
      const prod = this.products.get(exact.product_id);
      if (!prod || prod.deleted || prod.status !== "ACTIVE") {
        throw new Error("PRODUCT_INACTIVE_OR_DELETED");
      }
      return {
        product: prod,
        qtyMilli: exact.pack_qty_milli * multiplier,
        unitPriceCents: prod.price_cents
      };
    }

    // 2. Etiquetas EAN-13 de balanza (prefijo 20 = gramos, prefijo 21 = valor total en pesos)
    if (/^(20|21)\d{11}$/.test(code)) {
      const check = validateBarcode(code);
      if (!check.valid) {
        throw new Error("CORRUPT_EAN13_CHECK_DIGIT");
      }
      const prefix = code.slice(0, 2);
      const sku5 = code.slice(2, 7);
      const embeddedVal = parseInt(code.slice(7, 12), 10);

      const prod = [...this.products.values()].find(
        (p) => !p.deleted && p.status === "ACTIVE" && p.sku === sku5
      );
      if (prod) {
        if (prefix === "20") {
          // Peso en gramos (ej. 00375 = 375 gramos = 375 milésimas de kg)
          return {
            product: prod,
            qtyMilli: embeddedVal * multiplier,
            unitPriceCents: prod.price_cents
          };
        } else {
          // Prefijo 21: Precio total embebido en pesos COP -> calcular cantidad en gramos hacia atrás
          const totalCents = embeddedVal * 100;
          const qtyMilli = Math.round((totalCents * 1000) / prod.price_cents);
          return {
            product: prod,
            qtyMilli: qtyMilli * multiplier,
            unitPriceCents: prod.price_cents
          };
        }
      }
    }

    // Si es un EAN-13 inválido y no existe en catálogo, reportar lectura corrupta
    if (/^\d{13}$/.test(code) && !validateBarcode(code).valid) {
      throw new Error("CORRUPT_EAN13_CHECK_DIGIT");
    }

    throw new Error("BARCODE_NOT_FOUND");
  }

  /**
   * HU-415: Calcula cuántos gramos entregar cuando el cliente pide por valor en pesos
   * (ej. "deme $3.000 de salchichón" a $20.000/kg -> 150 gramos).
   */
  calculateWeightByRequestedAmountCents(
    productId: string,
    requestedAmountCents: number
  ): { gramsToDeliver: number; qtyMilliKg: number; lineTotalCents: number } {
    const prod = this.products.get(productId);
    if (!prod || !prod.is_weighted || prod.price_cents <= 0) {
      throw new Error("PRODUCT_NOT_WEIGHTED");
    }
    const grams = Math.round((requestedAmountCents * 1000) / prod.price_cents);
    return {
      gramsToDeliver: grams,
      qtyMilliKg: grams,
      lineTotalCents: requestedAmountCents
    };
  }

  /**
   * HU-417: Consulta rápida de precio (`F3`) sin agregar al carrito ni disparar auditoría de ítem borrado.
   */
  cmdConsultPriceOnly(barcodeOrSku: string): {
    name: string;
    priceCents: number;
    estimatedStockMilli: number;
  } {
    const found = this.cmdLookupBarcode(barcodeOrSku);
    return {
      name: found.product.name,
      priceCents: found.product.price_cents,
      estimatedStockMilli: this.getEstimatedStockMilli(found.product.id)
    };
  }

  /**
   * HU-034, HU-172, HU-173, HU-211 & HU-448: Búsqueda FTS por tokens en cualquier orden,
   * insensible a tildes/mayúsculas, excluyendo productos inactivos/borrados.
   */
  cmdSearchProducts(query: string): {
    product: LocalProductRow;
    estimatedStockMilli: number;
  }[] {
    const tokens = normalizeSearchText(query)
      .split(/\s+/)
      .filter(Boolean);

    const results: { product: LocalProductRow; estimatedStockMilli: number }[] = [];
    for (const p of this.products.values()) {
      if (p.deleted || p.status !== "ACTIVE" || p.id === SYSTEM_GENERIC_PRODUCT_ID) {
        continue;
      }
      const haystack = normalizeSearchText(`${p.name} ${p.sku}`);
      if (tokens.every((tok) => haystack.includes(tok))) {
        results.push({
          product: p,
          estimatedStockMilli: this.getEstimatedStockMilli(p.id)
        });
      }
    }
    return results.slice(0, 30);
  }

  /**
   * HU-035 & HU-323: Eliminación de un ítem ya escaneado del carrito registrando auditoría `cart.item.remove_after_scan`.
   */
  cmdRemoveScannedCartItem(params: {
    items: CartItemDraft[];
    lineId: string;
    cashierId: string;
    nowMs?: number;
  }): CartItemDraft[] {
    const nowMs = params.nowMs ?? Date.now();
    const target = params.items.find((i) => i.line_id === params.lineId);
    if (!target) return params.items;

    this.auth.recordAudit(
      "cart.item.remove_after_scan",
      params.cashierId,
      null,
      target.product_id,
      {
        description: target.description,
        qty_milli: target.qty_milli,
        unit_price_cents: target.unit_price_cents
      },
      nowMs
    );

    return params.items.filter((i) => i.line_id !== params.lineId);
  }

  /**
   * HU-038: Agrega un artículo genérico al carrito exigiendo aprobación de supervisor/dueño.
   */
  cmdAddGenericItemToCart(params: {
    description: string;
    unitPriceCents: number;
    qtyMilli?: number;
    approvalNonce: string;
    nowMs?: number;
  }): CartItemDraft {
    const nowMs = params.nowMs ?? Date.now();
    this.auth.consumeApprovalNonce(params.approvalNonce, "sale.generic_item", nowMs);
    return {
      line_id: newId(nowMs),
      product_id: SYSTEM_GENERIC_PRODUCT_ID,
      description: params.description.trim(),
      qty_milli: params.qtyMilli ?? 1000,
      unit_price_cents: params.unitPriceCents,
      discount_cents: 0,
      taxes: [{ code: "EXCLUIDO", kind: "PERCENT", rate_bp: 0 }],
      is_generic_item: true
    };
  }

  /**
   * HU-039: Aplica descuento a una línea validando el tope libre del cajero (`maxCashierFreeDiscountBp`)
   * y exigiendo `approvalNonce` (`sale.discount.extraordinary`) si lo supera.
   */
  cmdApplyLineDiscountPercent(params: {
    item: CartItemDraft;
    discountBp: number; // ej. 500 = 5%, 1500 = 15%
    cashierId: string;
    approvalNonce?: string;
    nowMs?: number;
  }): CartItemDraft {
    const nowMs = params.nowMs ?? Date.now();
    if (params.discountBp > this.maxCashierFreeDiscountBp) {
      if (!params.approvalNonce) {
        throw new Error("DISCOUNT_EXCEEDS_CASHIER_LIMIT_APPROVAL_REQUIRED");
      }
      const consumed = this.auth.consumeApprovalNonce(
        params.approvalNonce,
        "sale.discount.extraordinary",
        nowMs
      );
      this.auth.recordAudit(
        "sale.discount.extraordinary",
        params.cashierId,
        consumed.approverId,
        params.item.product_id,
        { discount_bp: params.discountBp },
        nowMs
      );
    }

    const grossCents = Math.round((params.item.qty_milli * params.item.unit_price_cents) / 1000);
    const discountCents = Math.round((grossCents * params.discountBp) / 10_000);
    return {
      ...params.item,
      discount_cents: discountCents
    };
  }

  /**
   * HU-040: Sobrescritura puntual de precio unitario en el carrito con autorización de supervisor y sin alterar el catálogo.
   */
  cmdOverrideLineUnitPrice(params: {
    item: CartItemDraft;
    newUnitPriceCents: number;
    cashierId: string;
    approvalNonce: string;
    nowMs?: number;
  }): CartItemDraft {
    const nowMs = params.nowMs ?? Date.now();
    const consumed = this.auth.consumeApprovalNonce(
      params.approvalNonce,
      "sale.price.override",
      nowMs
    );
    this.auth.recordAudit(
      "sale.price.override",
      params.cashierId,
      consumed.approverId,
      params.item.product_id,
      {
        old_price_cents: params.item.unit_price_cents,
        new_price_cents: params.newUnitPriceCents
      },
      nowMs
    );
    return {
      ...params.item,
      unit_price_cents: params.newUnitPriceCents
    };
  }

  /**
   * HU-353 & HU-354: Agrega depósito de envase retornable cuando el cliente no entrega casco vacío,
   * o descuenta/recibe envases vacíos devueltos.
   */
  buildReturnableBottleDepositLine(
    beverageProduct: LocalProductRow,
    qtyMilli: number,
    nowMs = Date.now()
  ): CartItemDraft | null {
    if (!beverageProduct.returnable_bottle_product_id || !beverageProduct.returnable_deposit_cents) {
      return null;
    }
    return {
      line_id: newId(nowMs),
      product_id: beverageProduct.returnable_bottle_product_id,
      description: `Envase Retornable (${beverageProduct.name})`,
      qty_milli: qtyMilli,
      unit_price_cents: beverageProduct.returnable_deposit_cents,
      discount_cents: 0,
      taxes: [{ code: "EXCLUIDO", kind: "PERCENT", rate_bp: 0 }],
      is_generic_item: false
    };
  }

  /**
   * HU-042 & HU-213: Suspender (`park`) y recuperar carritos en espera sin consumir consecutivo.
   */
  cmdParkCart(params: {
    cashierId: string;
    label: string;
    items: CartItemDraft[];
    nowMs?: number;
  }): ParkedCartRow {
    const nowMs = params.nowMs ?? Date.now();
    const parked: ParkedCartRow = {
      id: newId(nowMs),
      cashier_id: params.cashierId,
      label: params.label,
      items: params.items.map((i) => ({ ...i })),
      created_at_ms: nowMs
    };
    this.parkedCarts.set(parked.id, parked);
    return parked;
  }

  cmdListParkedCarts(): ParkedCartRow[] {
    return [...this.parkedCarts.values()];
  }

  cmdResumeParkedCart(parkedId: string): CartItemDraft[] {
    const p = this.parkedCarts.get(parkedId);
    if (!p) throw new Error("PARKED_CART_NOT_FOUND");
    this.parkedCarts.delete(parkedId);
    return p.items;
  }

  /**
   * HU-178: Ajusta `next_receipt_number` tras restaurar un snapshot para que nunca colisione con el último reportado a la nube.
   */
  syncReceiptNumberAfterRestore(cloudLastReportedReceiptNumber: number): number {
    if (!this.auth.deviceState) return 1;
    const next = Math.max(
      this.auth.deviceState.next_receipt_number,
      cloudLastReportedReceiptNumber + 1
    );
    this.auth.deviceState.next_receipt_number = next;
    return next;
  }

  /**
   * HU-043, HU-044, HU-174..HU-180, HU-214, HU-278, HU-325, HU-416, HU-452 & HU-454:
   * Cobro atómico (`CompleteSale`), idempotente por `cart_id`, con pagos mixtos, fiados,
   * abono combinado opcional y soporte de modo práctica y ahorro de papel.
   */
  cmdCompleteSale(params: {
    cartId: string;
    cashSessionId: string;
    cashierId: string;
    cashierName: string;
    customerId?: string | null;
    pickupPerson?: string | null;
    items: CartItemDraft[];
    payments: {
      method: "CASH" | "DEBIT" | "CREDIT_CARD" | "NEQUI" | "DAVIPLATA" | "BRE_B" | "TRANSFER" | "CREDIT_ACCOUNT";
      amountCents: number;
      tenderedCents?: number | null;
      reference?: string | null;
    }[];
    extraCreditAccountAbonoCents?: number; // HU-325: Venta + abono a deuda con el mismo billete
    confirmHighCashTender?: boolean; // HU-416: Confirmación si efectivo recibido > $100.000 y cambio > $100.000
    creditExceedApprovalNonce?: string;
    skipPrintPaperSaving?: boolean; // HU-454: Cobrar sin imprimir (F11)
    simulatePowerCutBeforeCommit?: boolean; // HU-278: Prueba de atomicidad ante apagón
    nowMs?: number;
  }): {
    sale: LocalSaleRecord;
    printedTicket: string | null;
    drawerOpened: boolean;
    combinedChangeCents: number;
  } {
    const nowMs = params.nowMs ?? Date.now();

    // HU-043 & E29: Idempotencia por cart_id (doble clic en Cobrar devuelve la misma venta)
    const existingByCart = this.salesByCartId.get(params.cartId);
    if (existingByCart) {
      return {
        sale: existingByCart,
        printedTicket: null,
        drawerOpened: false,
        combinedChangeCents: 0
      };
    }

    if (params.items.length === 0) {
      throw new Error("EMPTY_CART");
    }

    // Verificar que ningún producto tenga allow_negative_stock = false con stock insuficiente
    for (const item of params.items) {
      const prod = this.products.get(item.product_id);
      if (prod && prod.track_stock && !prod.allow_negative_stock) {
        const currentStock = this.getEstimatedStockMilli(prod.id);
        if (currentStock - item.qty_milli < 0) {
          throw new Error(`NEGATIVE_STOCK_NOT_ALLOWED:${prod.name}`);
        }
      }
    }

    const hasCashPayment = params.payments.some((p) => p.method === "CASH");
    const totals = calculateCartTotals({
      lines: params.items.map((i) => ({
        product_id: i.product_id,
        qty_milli: i.qty_milli,
        unit_price_cents: i.unit_price_cents,
        discount_cents: i.discount_cents,
        taxes: i.taxes
      })),
      apply_cash_rounding: hasCashPayment,
      rounding_step_cents: 5000
    });

    if (totals.total_cents <= 0) {
      throw new Error("INVALID_SALE_TOTAL");
    }

    // HU-175 & HU-176: Validar pagos mixtos y referencias digitales
    const nonCashSum = params.payments
      .filter((p) => p.method !== "CASH")
      .reduce((acc, p) => acc + p.amountCents, 0);
    if (nonCashSum > totals.total_cents) {
      throw new Error(
        `El pago digital no puede superar el saldo por pagar (${totals.total_cents})`
      );
    }

    const totalPaid = params.payments.reduce((acc, p) => acc + p.amountCents, 0);
    if (totalPaid !== totals.total_cents) {
      throw new Error(`PAYMENT_SUM_MISMATCH:${totalPaid}!=${totals.total_cents}`);
    }

    const extraAbonoCents = params.extraCreditAccountAbonoCents ?? 0;
    let combinedChangeCents = 0;

    const normalizedPayments = params.payments.map((p) => {
      if (p.method !== "CASH" && p.method !== "CREDIT_ACCOUNT") {
        if (!p.reference || p.reference.trim().length < 3) {
          throw new Error(`DIGITAL_PAYMENT_REFERENCE_REQUIRED:${p.method}`);
        }
      }
      if (p.method === "CASH") {
        const tendered = p.tenderedCents ?? p.amountCents + extraAbonoCents;
        const requiredCash = p.amountCents + extraAbonoCents;
        if (tendered < requiredCash) {
          throw new Error("INSUFFICIENT_CASH_TENDERED");
        }
        const change = tendered - requiredCash;
        // HU-416: Alerta preventiva si digitó ej. $500.000 por error
        if (tendered > 10_000_000 && change > 10_000_000 && !params.confirmHighCashTender) {
          throw new Error("HIGH_CASH_TENDER_CONFIRMATION_REQUIRED");
        }
        combinedChangeCents += change;
        return {
          payment_id: newId(nowMs),
          method: p.method,
          amount_cents: p.amountCents,
          tendered_cents: tendered,
          change_cents: change,
          reference: null
        };
      }
      return {
        payment_id: newId(nowMs),
        method: p.method,
        amount_cents: p.amountCents,
        tendered_cents: null,
        change_cents: null,
        reference: p.reference ? p.reference.trim() : null
      };
    });

    // HU-452: Si está en Modo Práctica, no toca la base real ni el outbox ni el consecutivo real
    if (this.isPracticeMode) {
      const practiceSale: LocalSaleRecord = {
        id: newId(nowMs),
        cart_id: params.cartId,
        cash_session_id: params.cashSessionId,
        cashier_id: params.cashierId,
        customer_id: params.customerId ?? null,
        receipt_prefix: "PRAC",
        receipt_number: 1,
        receipt_code: "PRAC-000001",
        status: "COMPLETED",
        totals,
        payments: normalizedPayments,
        is_credit: false,
        issued_at_ms: nowMs
      };
      const ticket = this.printer.renderSaleReceiptText({
        businessName: "TIENDA MODO PRÁCTICA",
        address: "Entrenamiento",
        terminalCode: "PRAC",
        cashierName: params.cashierName,
        receiptCode: practiceSale.receipt_code,
        issuedAtIso: new Date(nowMs).toISOString(),
        lines: params.items.map((i, idx) => ({
          description: i.description,
          qtyLabel: `${i.qty_milli / 1000}`,
          lineTotalCents: totals.lines[idx]!.line_total_cents
        })),
        subtotalCents: totals.subtotal_cents,
        discountCents: totals.discount_cents,
        taxCents: totals.tax_cents,
        roundingCents: totals.rounding_cents,
        totalCents: totals.total_cents,
        payments: normalizedPayments.map((p) => ({
          method: p.method,
          amountCents: p.amount_cents,
          tenderedCents: p.tendered_cents,
          changeCents: p.change_cents
        })),
        isPracticeMode: true
      });
      return {
        sale: practiceSale,
        printedTicket: ticket,
        drawerOpened: false,
        combinedChangeCents
      };
    }

    // HU-278 (E02): Si ocurre un corte de energía antes del COMMIT, nada se modifica
    if (params.simulatePowerCutBeforeCommit) {
      throw new Error("SIMULATED_POWER_CUT_BEFORE_COMMIT_ROLLED_BACK");
    }

    const saleId = newId(nowMs);
    const creditPayment = normalizedPayments.find((p) => p.method === "CREDIT_ACCOUNT");
    let creditPrevBalance: number | null = null;
    let creditNewBalance: number | null = null;

    if (creditPayment) {
      if (!params.customerId) {
        throw new Error("CREDIT_SALE_REQUIRES_CUSTOMER");
      }
      const creditRes = this.customers.validateAndRecordCreditCharge({
        customerId: params.customerId,
        chargeAmountCents: creditPayment.amount_cents,
        saleId,
        pickupPerson: params.pickupPerson,
        approvalNonce: params.creditExceedApprovalNonce,
        nowMs
      });
      creditPrevBalance = creditRes.previousBalanceCents;
      creditNewBalance = creditRes.newBalanceCents;
    }

    // HU-325: Si además abonó a su deuda anterior con el mismo billete
    if (extraAbonoCents > 0 && params.customerId) {
      const abonoRes = this.customers.cmdRecordCreditPayment({
        customerId: params.customerId,
        cashSessionId: params.cashSessionId,
        amountCents: extraAbonoCents,
        method: "CASH",
        receivedBy: params.cashierId,
        nowMs
      });
      creditPrevBalance = abonoRes.previousBalanceCents;
      creditNewBalance = abonoRes.newBalanceCents;
    }

    const prefix = this.auth.deviceState ? this.auth.deviceState.receipt_prefix : "C01";
    const receiptNumber = this.auth.deviceState ? this.auth.deviceState.next_receipt_number++ : this.sales.size + 1;
    const receiptCode = `${prefix}-${String(receiptNumber).padStart(6, "0")}`;

    // Descontar inventario local para productos con track_stock = true
    for (const item of params.items) {
      const prod = this.products.get(item.product_id);
      if (!prod || prod.track_stock) {
        this.localStockMovements.push({
          id: newId(nowMs),
          product_id: item.product_id,
          qty_milli: -item.qty_milli,
          kind: "SALE",
          source_id: saleId,
          occurred_at_ms: nowMs,
          synced: false
        });
      }
    }

    // Registrar efectivo recibido y cambio en la sesión de caja
    for (const p of normalizedPayments) {
      if (p.method === "CASH") {
        this.cash.movements.push({
          id: newId(nowMs),
          cash_session_id: params.cashSessionId,
          kind: "SALE_CASH",
          amount_cents: p.amount_cents + (p.change_cents ?? 0),
          reason: `Venta ${receiptCode}`,
          approved_by: null,
          created_by: params.cashierId,
          occurred_at_ms: nowMs,
          voided: false
        });
        if (p.change_cents && p.change_cents > 0) {
          this.cash.movements.push({
            id: newId(nowMs),
            cash_session_id: params.cashSessionId,
            kind: "CHANGE_GIVEN",
            amount_cents: p.change_cents,
            reason: `Cambio ${receiptCode}`,
            approved_by: null,
            created_by: params.cashierId,
            occurred_at_ms: nowMs,
            voided: false
          });
        }
      }
    }

    const payload = SaleCompletedV1Schema.parse({
      sale_id: saleId,
      receipt_prefix: prefix,
      receipt_number: receiptNumber,
      cash_session_id: params.cashSessionId,
      cashier_id: params.cashierId,
      customer_id: params.customerId ?? null,
      lines: params.items.map((item, idx) => {
        const calcLine = totals.lines[idx]!;
        return {
          line_id: item.line_id,
          line_no: idx + 1,
          product_id: item.product_id,
          description: item.description,
          qty_milli: item.qty_milli,
          unit_price_cents: item.unit_price_cents,
          discount_cents: calcLine.discount_cents,
          tax_detail: calcLine.tax_detail,
          line_total_cents: calcLine.line_total_cents,
          is_generic_item: item.is_generic_item
        };
      }),
      payments: normalizedPayments,
      totals: {
        subtotal_cents: totals.subtotal_cents,
        discount_cents: totals.discount_cents,
        tax_cents: totals.tax_cents,
        rounding_cents: totals.rounding_cents,
        total_cents: totals.total_cents
      },
      is_credit: Boolean(creditPayment)
    });

    const seq = this.auth.deviceState ? this.auth.deviceState.next_terminal_seq++ : this.storage.outbox.length + 1;
    const hlc = this.auth.advanceClockAndGenerateHlc(nowMs);
    this.storage.outbox.push({
      event_id: newId(nowMs),
      terminal_seq: seq,
      event_type: "sale.completed",
      schema_version: 1,
      payload: JSON.stringify(payload),
      payload_hash: canonicalSha256(payload),
      occurred_at: nowMs,
      hlc,
      status: "PENDING",
      attempts: 0,
      last_error: null,
      sent_at: null
    });

    const saleRecord: LocalSaleRecord = {
      id: saleId,
      cart_id: params.cartId,
      cash_session_id: params.cashSessionId,
      cashier_id: params.cashierId,
      customer_id: params.customerId ?? null,
      receipt_prefix: prefix,
      receipt_number: receiptNumber,
      receipt_code: receiptCode,
      status: "COMPLETED",
      totals,
      payments: normalizedPayments,
      is_credit: Boolean(creditPayment),
      issued_at_ms: nowMs
    };

    this.sales.set(saleId, saleRecord);
    this.salesByCartId.set(params.cartId, saleRecord);

    const customerObj = params.customerId ? this.customers.customers.get(params.customerId) : null;
    const drawerOpened = this.printer.pulseCashDrawerIfApplicable(hasCashPayment);

    let printedTicket: string | null = null;
    if (!params.skipPrintPaperSaving) {
      const ticketText = this.printer.renderSaleReceiptText({
        businessName: "Tienda Doña María",
        address: "Calle Principal # 10-20",
        terminalCode: prefix,
        cashierName: params.cashierName,
        receiptCode,
        issuedAtIso: new Date(nowMs).toISOString(),
        customerName: customerObj?.full_name ?? null,
        customerDoc: customerObj?.doc_number ? `${customerObj.doc_type ?? ""} ${customerObj.doc_number}` : null,
        authorizedPickupName: params.pickupPerson ?? null,
        lines: params.items.map((i, idx) => ({
          description: i.description,
          qtyLabel: `${i.qty_milli / 1000}`,
          lineTotalCents: totals.lines[idx]!.line_total_cents
        })),
        subtotalCents: totals.subtotal_cents,
        discountCents: totals.discount_cents,
        taxCents: totals.tax_cents,
        roundingCents: totals.rounding_cents,
        totalCents: totals.total_cents,
        payments: normalizedPayments.map((p) => ({
          method: p.method,
          amountCents: p.amount_cents,
          tenderedCents: p.tendered_cents,
          changeCents: p.change_cents
        })),
        creditPreviousBalanceCents: creditPrevBalance,
        creditNewBalanceCents: creditNewBalance
      });
      this.printer.printOrEnqueue(ticketText);
      printedTicket = ticketText;
    }

    return {
      sale: saleRecord,
      printedTicket,
      drawerOpened,
      combinedChangeCents
    };
  }

  /**
   * HU-050 & HU-177: Reimpresión auditada de comprobante con marca `*** COPIA DE COMPROBANTE ***`
   * y aviso de última venta tras apagón.
   */
  cmdReprintSaleReceipt(saleId: string, actorId: string, nowMs = Date.now()): string {
    const sale = this.sales.get(saleId);
    if (!sale) throw new Error("SALE_NOT_FOUND");
    this.auth.recordAudit("receipt.reprint", actorId, null, sale.id, { receipt_code: sale.receipt_code }, nowMs);
    const ticket = this.printer.renderSaleReceiptText({
      businessName: "Tienda Doña María",
      address: "Calle Principal # 10-20",
      terminalCode: sale.receipt_prefix,
      cashierName: actorId,
      receiptCode: sale.receipt_code,
      issuedAtIso: new Date(sale.issued_at_ms).toISOString(),
      lines: sale.totals.lines.map((l) => ({
        description: l.product_id,
        qtyLabel: `${l.qty_milli / 1000}`,
        lineTotalCents: l.line_total_cents
      })),
      subtotalCents: sale.totals.subtotal_cents,
      discountCents: sale.totals.discount_cents,
      taxCents: sale.totals.tax_cents,
      roundingCents: sale.totals.rounding_cents,
      totalCents: sale.totals.total_cents,
      payments: sale.payments.map((p) => ({
        method: p.method,
        amountCents: p.amount_cents,
        tenderedCents: p.tendered_cents,
        changeCents: p.change_cents
      })),
      isReprint: true
    });
    this.printer.printOrEnqueue(ticket);
    return ticket;
  }

  /**
   * HU-045, HU-046 & HU-215: Anulación y devolución parcial/total validando que la suma de unidades
   * devueltas no supere la cantidad vendida originalmente, reponiendo stock y ajustando el efectivo del turno.
   */
  cmdReturnOrVoidSale(params: {
    originalSaleId?: string | null;
    manualReceiptRef?: string | null;
    cashSessionId: string;
    kind: "VOID" | "PARTIAL_RETURN" | "FULL_RETURN";
    linesToReturn: { product_id: string; qty_milli: number; refund_line_cents: number }[];
    refundMethod: "CASH" | "CREDIT_ACCOUNT" | "NEQUI" | "TRANSFER";
    reason: string;
    requestedBy: string;
    approvalNonce: string;
    nowMs?: number;
  }): LocalSaleReturnRecord {
    const nowMs = params.nowMs ?? Date.now();
    const perm = params.kind === "VOID" ? "sale.void" : "sale.return";
    const consumed = this.auth.consumeApprovalNonce(params.approvalNonce, perm, nowMs);

    const origSale = params.originalSaleId ? this.sales.get(params.originalSaleId) : null;
    if (params.originalSaleId && !origSale) {
      throw new Error("ORIGINAL_SALE_NOT_FOUND");
    }

    if (origSale) {
      for (const reqLine of params.linesToReturn) {
        const soldMilli = origSale.totals.lines
          .filter((l) => l.product_id === reqLine.product_id)
          .reduce((acc, l) => acc + l.qty_milli, 0);

        const alreadyReturnedMilli = this.saleReturns
          .filter((r) => r.original_sale_id === origSale.id)
          .flatMap((r) => r.lines)
          .filter((l) => l.product_id === reqLine.product_id)
          .reduce((acc, l) => acc + l.qty_milli, 0);

        if (alreadyReturnedMilli + reqLine.qty_milli > soldMilli) {
          throw new Error("RETURN_QTY_EXCEEDS_SOLD_QTY");
        }
      }
    }

    const refundTotalCents = params.linesToReturn.reduce((acc, l) => acc + l.refund_line_cents, 0);
    const returnId = newId(nowMs);

    for (const line of params.linesToReturn) {
      this.localStockMovements.push({
        id: newId(nowMs),
        product_id: line.product_id,
        qty_milli: line.qty_milli, // positivo: repone stock
        kind: "RETURN",
        source_id: returnId,
        occurred_at_ms: nowMs,
        synced: false
      });
    }

    if (params.refundMethod === "CASH" && refundTotalCents > 0) {
      this.cash.movements.push({
        id: newId(nowMs),
        cash_session_id: params.cashSessionId,
        kind: "REFUND_CASH",
        amount_cents: refundTotalCents,
        reason: `Devolución ${origSale?.receipt_code ?? params.manualReceiptRef ?? ""}`,
        approved_by: consumed.approverId,
        created_by: params.requestedBy,
        occurred_at_ms: nowMs,
        voided: false
      });
    }

    if (origSale) {
      origSale.status = params.kind === "VOID" ? "VOIDED" : "PARTIALLY_RETURNED";
    }

    const eventType = params.kind === "VOID" ? "sale.voided" : "sale.returned";
    const eventPayload =
      params.kind === "VOID"
        ? SaleVoidedV1Schema.parse({
            return_id: returnId,
            original_sale_id: origSale!.id,
            cash_session_id: params.cashSessionId,
            requested_by: params.requestedBy,
            approved_by: consumed.approverId,
            self_approved: consumed.selfApproved,
            reason: params.reason,
            refund_total_cents: refundTotalCents,
            refund_method: params.refundMethod,
            occurred_at: new Date(nowMs).toISOString()
          })
        : SaleReturnedV1Schema.parse({
            return_id: returnId,
            original_sale_id: origSale ? origSale.id : null,
            manual_receipt_ref: params.manualReceiptRef ?? null,
            cash_session_id: params.cashSessionId,
            kind: params.kind,
            requested_by: params.requestedBy,
            approved_by: consumed.approverId,
            self_approved: consumed.selfApproved,
            reason: params.reason,
            lines: params.linesToReturn,
            refund_total_cents: refundTotalCents,
            refund_method: params.refundMethod,
            occurred_at: new Date(nowMs).toISOString()
          });

    const seq = this.auth.deviceState ? this.auth.deviceState.next_terminal_seq++ : this.storage.outbox.length + 1;
    this.storage.outbox.push({
      event_id: newId(nowMs),
      terminal_seq: seq,
      event_type: eventType,
      schema_version: 1,
      payload: JSON.stringify(eventPayload),
      payload_hash: canonicalSha256(eventPayload),
      occurred_at: nowMs,
      hlc: this.auth.advanceClockAndGenerateHlc(nowMs),
      status: "PENDING",
      attempts: 0,
      last_error: null,
      sent_at: null
    });

    const rec: LocalSaleReturnRecord = {
      id: returnId,
      original_sale_id: origSale ? origSale.id : null,
      manual_receipt_ref: params.manualReceiptRef ?? null,
      kind: params.kind,
      reason: params.reason,
      approved_by: consumed.approverId,
      lines: params.linesToReturn,
      refund_total_cents: refundTotalCents,
      refund_method: params.refundMethod,
      cash_session_id: params.cashSessionId,
      occurred_at_ms: nowMs
    };
    this.saleReturns.push(rec);
    return rec;
  }

  /**
   * HU-047: Cambio mano a mano de producto (entra el devuelto +1, sale el nuevo -1, cobra diferencia incluso si es $0).
   * Si se especifica cashSessionId y pago en efectivo, registra el movimiento de efectivo y abre cajón.
   */
  cmdExchangeProduct(params: {
    returnedProductId: string;
    returnedQtyMilli: number;
    returnedPriceCents: number;
    newProductId: string;
    newQtyMilli: number;
    newPriceCents: number;
    approvalNonce: string;
    cashSessionId?: string;
    paymentMethod?: "CASH" | "NEQUI" | "CREDIT" | "NONE";
    reason?: string;
    requestedBy?: string;
    nowMs?: number;
  }): { differenceToPayCents: number; drawerOpened: boolean; exchangeId: string } {
    const nowMs = params.nowMs ?? Date.now();
    const consumed = this.auth.consumeApprovalNonce(params.approvalNonce, "sale.return", nowMs);

    const exchangeId = newId(nowMs);
    this.localStockMovements.push(
      {
        id: newId(nowMs),
        product_id: params.returnedProductId,
        qty_milli: params.returnedQtyMilli,
        kind: "RETURN",
        source_id: exchangeId,
        occurred_at_ms: nowMs,
        synced: false
      },
      {
        id: newId(nowMs),
        product_id: params.newProductId,
        qty_milli: -params.newQtyMilli,
        kind: "SALE",
        source_id: exchangeId,
        occurred_at_ms: nowMs,
        synced: false
      }
    );

    const returnedVal = Math.round((params.returnedQtyMilli * params.returnedPriceCents) / 1000);
    const newVal = Math.round((params.newQtyMilli * params.newPriceCents) / 1000);
    const differenceToPayCents = newVal - returnedVal;

    let drawerOpened = false;
    if (params.cashSessionId && (params.paymentMethod === "CASH" || (!params.paymentMethod && differenceToPayCents !== 0))) {
      if (differenceToPayCents > 0) {
        // El cliente paga la diferencia en efectivo
        this.cash.movements.push({
          id: newId(nowMs),
          cash_session_id: params.cashSessionId,
          kind: "SALE_CASH",
          amount_cents: differenceToPayCents,
          reason: `Diferencia cobrada cambio mano a mano ${exchangeId}`,
          approved_by: consumed.approverId,
          created_by: params.requestedBy ?? consumed.approverId,
          occurred_at_ms: nowMs,
          voided: false
        });
        drawerOpened = this.printer.pulseCashDrawerIfApplicable(true);
      } else if (differenceToPayCents < 0) {
        // La tienda devuelve el excedente en efectivo
        this.cash.movements.push({
          id: newId(nowMs),
          cash_session_id: params.cashSessionId,
          kind: "REFUND_CASH",
          amount_cents: Math.abs(differenceToPayCents),
          reason: `Excedente devuelto cambio mano a mano ${exchangeId}`,
          approved_by: consumed.approverId,
          created_by: params.requestedBy ?? consumed.approverId,
          occurred_at_ms: nowMs,
          voided: false
        });
        drawerOpened = this.printer.pulseCashDrawerIfApplicable(true);
      }
    }

    return {
      differenceToPayCents,
      drawerOpened,
      exchangeId
    };
  }
}
