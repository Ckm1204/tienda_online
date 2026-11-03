import { describe, it, expect } from "vitest";
import { SalesService } from "../index.js";

describe("ÉPICA 09: sales-service (Registro de Ventas, Consecutivos y Desglose Fiscal)", () => {
  it("HU-084: Deduplica idempotentemente eventos repetidos mediante inboxProcessed", () => {
    const service = new SalesService();
    const eventParams = {
      eventId: "evt-001",
      tenantId: "tenant-co-1",
      branchId: "branch-01",
      terminalId: "term-01",
      cashSessionId: "session-01",
      cashierId: "cashier-01",
      saleId: "sale-001",
      receiptPrefix: "POS",
      receiptNumber: 101,
      totalCents: 50_000_00,
      lines: [
        {
          line_id: "line-1",
          product_id: "prod-arroz",
          description: "Arroz Diana 1kg",
          qty_milli: 2000,
          unit_price_cents: 25_000_00,
          line_total_cents: 50_000_00
        }
      ],
      payments: [
        {
          payment_id: "pay-1",
          method: "CASH",
          amount_cents: 50_000_00,
          reference: null
        }
      ],
      occurredAtMs: 1730000000000
    };

    const first = service.consumeSaleCompletedEvent(eventParams);
    expect(first.deduplicated).toBe(false);
    expect(first.sale?.sale_id).toBe("sale-001");

    const second = service.consumeSaleCompletedEvent(eventParams);
    expect(second.deduplicated).toBe(true);
    expect(second.sale).toBeUndefined();
  });

  it("HU-281: Rechaza comprobantes con número duplicado para el mismo tenant y prefijo", () => {
    const service = new SalesService();
    const baseParams = {
      tenantId: "tenant-co-1",
      branchId: "branch-01",
      terminalId: "term-01",
      cashSessionId: "session-01",
      cashierId: "cashier-01",
      receiptPrefix: "POS",
      receiptNumber: 102,
      totalCents: 10_000_00,
      lines: [],
      payments: [],
      occurredAtMs: 1730000000000
    };

    service.consumeSaleCompletedEvent({
      ...baseParams,
      eventId: "evt-102-a",
      saleId: "sale-102-a"
    });

    expect(() =>
      service.consumeSaleCompletedEvent({
        ...baseParams,
        eventId: "evt-102-b",
        saleId: "sale-102-b"
      })
    ).toThrow("DUPLICATE_RECEIPT_NUMBER:POS-000102");
  });

  it("HU-192: Detecta y marca productos vendidos con precio anterior si el catálogo cambió en nube", () => {
    const service = new SalesService();
    // Catálogo actualizado a $12.000 COP a las 10:00 AM (1730000000000)
    service.latestCatalogPrices.set("prod-aceite", {
      price_cents: 12_000_00,
      updated_at_ms: 1730000000000
    });

    // Caja fuera de línea vendió a las 10:30 AM (1730001800000) a $10.000 COP
    const res = service.consumeSaleCompletedEvent({
      eventId: "evt-offline-sale",
      tenantId: "tenant-co-1",
      branchId: "branch-01",
      terminalId: "term-01",
      cashSessionId: "session-01",
      cashierId: "cashier-01",
      saleId: "sale-stale",
      receiptPrefix: "POS",
      receiptNumber: 103,
      totalCents: 10_000_00,
      lines: [
        {
          line_id: "line-stale",
          product_id: "prod-aceite",
          description: "Aceite 1L",
          qty_milli: 1000,
          unit_price_cents: 10_000_00,
          line_total_cents: 10_000_00
        }
      ],
      payments: [{ payment_id: "pay-stale", method: "CASH", amount_cents: 10_000_00, reference: null }],
      occurredAtMs: 1730001800000
    });

    expect(res.sale?.lines[0]?.sold_with_stale_price).toBe(true);
  });

  it("Consolidación Fiscal (Art. 616 E.T.): Calcula y publica el desglose tributario exacto en centavos", () => {
    const service = new SalesService();
    const res = service.consumeSaleCompletedEvent({
      eventId: "evt-fiscal-01",
      tenantId: "tenant-co-1",
      branchId: "branch-01",
      terminalId: "term-01",
      cashSessionId: "session-01",
      cashierId: "cashier-01",
      saleId: "sale-fiscal-01",
      receiptPrefix: "POS",
      receiptNumber: 104,
      totalCents: 119_000_00,
      lines: [
        {
          line_id: "l1",
          product_id: "prod-detergente",
          description: "Detergente en Polvo 1kg",
          qty_milli: 1000,
          unit_price_cents: 119_000_00,
          line_total_cents: 119_000_00,
          tax_category: "GRAVADO_19",
          tax_rate_bps: 1900,
          tax_amount_cents: 19_000_00
        }
      ],
      payments: [{ payment_id: "pay-f1", method: "CASH", amount_cents: 119_000_00, reference: null }],
      occurredAtMs: 1730000000000
    });

    const breakdown = res.sale?.tax_breakdown;
    expect(breakdown).toBeDefined();
    expect(breakdown?.gravado19_cents).toBe(100_000_00);
    expect(breakdown?.iva19_cents).toBe(19_000_00);
    expect(breakdown?.exento_cents).toBe(0);

    // Evento publicado contiene el desglose tributario
    const published = service.publishedEvents.find((e) => e.topic === "sales.events");
    expect(published).toBeDefined();
    expect((published?.payload as any).data.tax_breakdown.iva19_cents).toBe(19_000_00);
  });

  it("HU-193: Enlaza devoluciones diferidas (PENDING_ORIGINAL_SALE) al llegar la venta original", () => {
    const service = new SalesService();

    // 1. Llega devolución de otra caja referenciando comprobante POS-000105 antes de que llegue la venta
    const deferredReturn = service.consumeSaleReturnedEvent({
      eventId: "evt-ret-01",
      returnId: "ret-01",
      tenantId: "tenant-co-1",
      manualReceiptRef: "POS-000105",
      lines: [{ product_id: "prod-leche", qty_milli: 1000, refund_line_cents: 4_500_00 }],
      refundTotalCents: 4_500_00,
      occurredAtMs: 1730000500000
    });
    expect(deferredReturn.status).toBe("PENDING_ORIGINAL_SALE");

    // 2. Llega posteriormente la venta original POS-000105
    const saleResult = service.consumeSaleCompletedEvent({
      eventId: "evt-sale-105",
      tenantId: "tenant-co-1",
      branchId: "branch-01",
      terminalId: "term-02",
      cashSessionId: "session-02",
      cashierId: "cashier-02",
      saleId: "sale-105",
      receiptPrefix: "POS",
      receiptNumber: 105,
      totalCents: 9_000_00,
      lines: [
        {
          line_id: "l-leche",
          product_id: "prod-leche",
          description: "Leche Entera 1L",
          qty_milli: 2000,
          unit_price_cents: 4_500_00,
          line_total_cents: 9_000_00
        }
      ],
      payments: [{ payment_id: "pay-105", method: "CASH", amount_cents: 9_000_00, reference: null }],
      occurredAtMs: 1730000000000
    });

    expect(saleResult.linkedDeferredReturnsCount).toBe(1);
    expect(saleResult.sale?.status).toBe("PARTIALLY_RETURNED");
    expect(saleResult.sale?.lines[0]?.returned_qty_milli).toBe(1000);
    expect(deferredReturn.status).toBe("LINKED");
  });

  it("HU-085 & HU-403: Concilia pagos digitales por lotes y permite búsqueda por prefijo/número", () => {
    const service = new SalesService();
    service.consumeSaleCompletedEvent({
      eventId: "evt-nequi-sale",
      tenantId: "tenant-co-1",
      branchId: "branch-01",
      terminalId: "term-01",
      cashSessionId: "session-01",
      cashierId: "cashier-01",
      saleId: "sale-nequi",
      receiptPrefix: "POS",
      receiptNumber: 106,
      totalCents: 35_000_00,
      lines: [],
      payments: [
        {
          payment_id: "pay-nequi-1",
          method: "NEQUI",
          amount_cents: 35_000_00,
          reference: "NEQUI-REF-9988"
        }
      ],
      occurredAtMs: 1730000000000
    });

    const payment = service.payments.get("pay-nequi-1");
    expect(payment?.reconciliation_status).toBe("PENDING");

    // Conciliación en lote
    const reconciled = service.reconcilePaymentsBatch({
      tenantId: "tenant-co-1",
      paymentIds: ["pay-nequi-1"],
      status: "CONFIRMED",
      actorId: "supervisor-01"
    });

    expect(reconciled).toHaveLength(1);
    expect(reconciled[0]?.reconciliation_status).toBe("CONFIRMED");
    expect(reconciled[0]?.reconciled_by).toBe("supervisor-01");

    // HU-301: Búsqueda por prefijo y número
    const found = service.lookupReceipt("tenant-co-1", "POS", 106);
    expect(found?.sale_id).toBe("sale-nequi");
  });
});
