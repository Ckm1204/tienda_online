import { newId } from "@tiendita/contracts";

/**
 * ÉPICA 09 (FT-09.1) — sales-service: Registro de Ventas, Consecutivos Únicos y Conciliación de Pagos Digitales
 * Cubre: HU-084, HU-085, HU-192, HU-193, HU-281, HU-301, HU-403, HU-485.
 */

export interface CloudSaleLineRecord {
  line_id: string;
  product_id: string;
  description: string;
  qty_milli: number;
  unit_price_cents: number;
  line_total_cents: number;
  returned_qty_milli: number;
  sold_with_stale_price: boolean;
  tax_category?: "GRAVADO_19" | "GRAVADO_5" | "EXENTO" | "EXCLUIDO" | "INC_8";
  tax_rate_bps?: number;
  tax_amount_cents?: number;
}

export interface TaxBreakdownRecord {
  gravado19_cents: number;
  iva19_cents: number;
  gravado5_cents: number;
  iva5_cents: number;
  exento_cents: number;
  excluido_cents: number;
  inc8_cents: number;
}

export interface CloudPaymentReconciliationRecord {
  payment_id: string;
  sale_id: string;
  tenant_id: string;
  branch_id: string;
  cash_session_id: string;
  method: string;
  amount_cents: number;
  reference: string | null;
  reconciliation_status: "NOT_APPLICABLE" | "PENDING" | "CONFIRMED" | "FAILED";
  reconciled_by: string | null;
}

export interface CloudSaleRecord {
  sale_id: string;
  tenant_id: string;
  branch_id: string;
  terminal_id: string;
  cash_session_id: string;
  cashier_id: string;
  customer_id: string | null;
  receipt_prefix: string;
  receipt_number: number;
  receipt_code: string;
  total_cents: number;
  status: "COMPLETED" | "VOIDED" | "PARTIALLY_RETURNED" | "RETURNED";
  lines: CloudSaleLineRecord[];
  payments: CloudPaymentReconciliationRecord[];
  occurred_at_ms: number;
  tax_breakdown: TaxBreakdownRecord;
}

export interface DeferredReturnRecord {
  return_id: string;
  tenant_id: string;
  original_sale_id: string | null;
  manual_receipt_ref: string | null;
  status: "PENDING_ORIGINAL_SALE" | "LINKED" | "QUARANTINED";
  lines: { product_id: string; qty_milli: number; refund_line_cents: number }[];
  refund_total_cents: number;
  occurred_at_ms: number;
}

export class SalesService {
  private readonly inboxProcessed = new Set<string>();
  public readonly receiptNumbers = new Set<string>(); // `${tenantId}:${prefix}:${number}`
  public readonly sales = new Map<string, CloudSaleRecord>();
  private readonly salesByReceiptCode = new Map<string, CloudSaleRecord>();
  public readonly payments = new Map<string, CloudPaymentReconciliationRecord>();
  public readonly returns = new Map<string, DeferredReturnRecord>();
  public readonly latestCatalogPrices = new Map<string, { price_cents: number; updated_at_ms: number }>();
  public readonly publishedEvents: { topic: string; payload: unknown }[] = [];

  /**
   * HU-084, HU-192, HU-193 & HU-281: Consume `sale.completed` con idempotencia (`inbox`),
   * garantiza unicidad en `sale_receipt_numbers`, acepta productos borrados lógicamente (`E06`),
   * detecta ventas con precio anterior al cambio en nube (`E05`), calcula/asigna desglose fiscal
   * para consolidación en Libro Fiscal (Art. 616 E.T.) y enlaza devoluciones diferidas (`E23`).
   */
  consumeSaleCompletedEvent(params: {
    eventId: string;
    tenantId: string;
    branchId: string;
    terminalId: string;
    cashSessionId: string;
    cashierId: string;
    customerId?: string | null;
    saleId: string;
    receiptPrefix: string;
    receiptNumber: number;
    totalCents: number;
    taxBreakdown?: Partial<TaxBreakdownRecord>;
    lines: {
      line_id: string;
      product_id: string;
      description: string;
      qty_milli: number;
      unit_price_cents: number;
      line_total_cents: number;
      tax_category?: "GRAVADO_19" | "GRAVADO_5" | "EXENTO" | "EXCLUIDO" | "INC_8";
      tax_rate_bps?: number;
      tax_amount_cents?: number;
    }[];
    payments: {
      payment_id: string;
      method: string;
      amount_cents: number;
      reference: string | null;
    }[];
    occurredAtMs: number;
  }): { deduplicated: boolean; sale?: CloudSaleRecord; linkedDeferredReturnsCount: number } {
    if (this.inboxProcessed.has(params.eventId)) {
      return { deduplicated: true, linkedDeferredReturnsCount: 0 };
    }

    const receiptCode = `${params.receiptPrefix}-${String(params.receiptNumber).padStart(6, "0")}`;
    const receiptKey = `${params.tenantId}:${receiptCode}`;
    if (this.receiptNumbers.has(receiptKey)) {
      throw new Error(`DUPLICATE_RECEIPT_NUMBER:${receiptCode}`);
    }

    const cloudLines: CloudSaleLineRecord[] = params.lines.map((l) => {
      const latestPrice = this.latestCatalogPrices.get(l.product_id);
      // HU-192 (E05): Si el precio en nube cambió ANTES de occurredAtMs y la caja cobró un precio distinto, se respeta y se marca
      const stale = Boolean(
        latestPrice &&
          latestPrice.updated_at_ms < params.occurredAtMs &&
          latestPrice.price_cents !== l.unit_price_cents
      );
      return {
        ...l,
        returned_qty_milli: 0,
        sold_with_stale_price: stale
      };
    });

    const cloudPayments: CloudPaymentReconciliationRecord[] = params.payments.map((p) => {
      const isDigital = p.method !== "CASH" && p.method !== "CREDIT_ACCOUNT";
      const rec: CloudPaymentReconciliationRecord = {
        payment_id: p.payment_id,
        sale_id: params.saleId,
        tenant_id: params.tenantId,
        branch_id: params.branchId,
        cash_session_id: params.cashSessionId,
        method: p.method,
        amount_cents: p.amount_cents,
        reference: p.reference,
        reconciliation_status: isDigital ? "PENDING" : "NOT_APPLICABLE",
        reconciled_by: null
      };
      this.payments.set(rec.payment_id, rec);
      return rec;
    });

    // Desglose fiscal determinístico para Libro Fiscal (Art. 616 E.T.)
    const breakdown: TaxBreakdownRecord = {
      gravado19_cents: params.taxBreakdown?.gravado19_cents ?? 0,
      iva19_cents: params.taxBreakdown?.iva19_cents ?? 0,
      gravado5_cents: params.taxBreakdown?.gravado5_cents ?? 0,
      iva5_cents: params.taxBreakdown?.iva5_cents ?? 0,
      exento_cents: params.taxBreakdown?.exento_cents ?? 0,
      excluido_cents: params.taxBreakdown?.excluido_cents ?? 0,
      inc8_cents: params.taxBreakdown?.inc8_cents ?? 0
    };

    if (!params.taxBreakdown) {
      let anyTaxTagged = false;
      for (const l of cloudLines) {
        if (l.tax_category) {
          anyTaxTagged = true;
          const taxAmt = l.tax_amount_cents ?? 0;
          const baseAmt = l.line_total_cents - taxAmt;
          if (l.tax_category === "GRAVADO_19") {
            breakdown.gravado19_cents += baseAmt;
            breakdown.iva19_cents += taxAmt;
          } else if (l.tax_category === "GRAVADO_5") {
            breakdown.gravado5_cents += baseAmt;
            breakdown.iva5_cents += taxAmt;
          } else if (l.tax_category === "EXCLUIDO") {
            breakdown.excluido_cents += l.line_total_cents;
          } else if (l.tax_category === "INC_8") {
            breakdown.inc8_cents += l.line_total_cents;
          } else {
            breakdown.exento_cents += l.line_total_cents;
          }
        }
      }
      if (!anyTaxTagged) {
        breakdown.exento_cents = params.totalCents;
      }
    }

    const sale: CloudSaleRecord = {
      sale_id: params.saleId,
      tenant_id: params.tenantId,
      branch_id: params.branchId,
      terminal_id: params.terminalId,
      cash_session_id: params.cashSessionId,
      cashier_id: params.cashierId,
      customer_id: params.customerId ?? null,
      receipt_prefix: params.receiptPrefix,
      receipt_number: params.receiptNumber,
      receipt_code: receiptCode,
      total_cents: params.totalCents,
      status: "COMPLETED",
      lines: cloudLines,
      payments: cloudPayments,
      occurred_at_ms: params.occurredAtMs,
      tax_breakdown: breakdown
    };

    // HU-193 (E23): Verificar si había devoluciones en PENDING_ORIGINAL_SALE esperando este comprobante
    let linkedCount = 0;
    for (const ret of this.returns.values()) {
      if (
        ret.tenant_id === params.tenantId &&
        ret.status === "PENDING_ORIGINAL_SALE" &&
        (ret.original_sale_id === sale.sale_id || ret.manual_receipt_ref === receiptCode)
      ) {
        ret.original_sale_id = sale.sale_id;
        ret.status = "LINKED";
        sale.status = "PARTIALLY_RETURNED";
        for (const rl of ret.lines) {
          const sl = sale.lines.find((x) => x.product_id === rl.product_id);
          if (sl) sl.returned_qty_milli += rl.qty_milli;
        }
        linkedCount++;
      }
    }

    this.inboxProcessed.add(params.eventId);
    this.receiptNumbers.add(receiptKey);
    this.sales.set(sale.sale_id, sale);
    this.salesByReceiptCode.set(receiptKey, sale);
    this.publishedEvents.push({
      topic: "sales.events",
      payload: { type: "sales.recorded", data: sale }
    });

    return { deduplicated: false, sale, linkedDeferredReturnsCount: linkedCount };
  }

  /**
   * HU-193: Consume `sale.returned` soportando enlace diferido (`PENDING_ORIGINAL_SALE`) cuando la venta original de otra caja aún no ha llegado.
   */
  consumeSaleReturnedEvent(params: {
    eventId: string;
    returnId: string;
    tenantId: string;
    originalSaleId?: string | null;
    manualReceiptRef?: string | null;
    lines: { product_id: string; qty_milli: number; refund_line_cents: number }[];
    refundTotalCents: number;
    occurredAtMs: number;
  }): DeferredReturnRecord {
    if (this.inboxProcessed.has(params.eventId)) {
      return this.returns.get(params.returnId)!;
    }

    let origSale = params.originalSaleId ? this.sales.get(params.originalSaleId) : undefined;
    if (!origSale && params.manualReceiptRef) {
      origSale = this.salesByReceiptCode.get(`${params.tenantId}:${params.manualReceiptRef}`);
    }

    const rec: DeferredReturnRecord = {
      return_id: params.returnId,
      tenant_id: params.tenantId,
      original_sale_id: origSale ? origSale.sale_id : (params.originalSaleId ?? null),
      manual_receipt_ref: params.manualReceiptRef ?? null,
      status: origSale ? "LINKED" : "PENDING_ORIGINAL_SALE",
      lines: params.lines,
      refund_total_cents: params.refundTotalCents,
      occurred_at_ms: params.occurredAtMs
    };

    if (origSale) {
      origSale.status = "PARTIALLY_RETURNED";
      for (const rl of params.lines) {
        const sl = origSale.lines.find((x) => x.product_id === rl.product_id);
        if (sl) sl.returned_qty_milli += rl.qty_milli;
      }
    }

    this.inboxProcessed.add(params.eventId);
    this.returns.set(rec.return_id, rec);
    return rec;
  }

  /**
   * HU-085 & HU-403: Conciliación individual y en lote de pagos digitales (`CONFIRMED` / `FAILED`).
   */
  reconcilePaymentsBatch(params: {
    tenantId: string;
    paymentIds: string[];
    status: "CONFIRMED" | "FAILED";
    actorId: string;
  }): CloudPaymentReconciliationRecord[] {
    const updated: CloudPaymentReconciliationRecord[] = [];
    for (const id of params.paymentIds) {
      const p = this.payments.get(id);
      if (p && p.tenant_id === params.tenantId) {
        p.reconciliation_status = params.status;
        p.reconciled_by = params.actorId;
        updated.push(p);
        this.publishedEvents.push({
          topic: "sales.events",
          payload: {
            type: "payment.reconciliation_changed",
            data: { payment_id: p.payment_id, status: params.status, actor_id: params.actorId }
          }
        });
      }
    }
    return updated;
  }

  /**
   * HU-301 & HU-485: Búsqueda de comprobante por `prefix` + `number` para devoluciones cruzadas y auditoría.
   */
  lookupReceipt(tenantId: string, prefix: string, number: number): CloudSaleRecord | null {
    const code = `${prefix}-${String(number).padStart(6, "0")}`;
    return this.salesByReceiptCode.get(`${tenantId}:${code}`) ?? null;
  }
}
