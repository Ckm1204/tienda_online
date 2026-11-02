import { describe, it, expect } from "vitest";
import { newId } from "@tiendita/contracts";
import { SalesService } from "@tiendita/sales-service";
import { CashService } from "@tiendita/cash-service";
import { InventoryService } from "@tiendita/inventory-service";
import { CustomerService } from "@tiendita/customer-service";
import { AuditService } from "../index.js";

describe("ÉPICA 09 — Microservicios Operativos en Nube (sales, cash, inventory, customer, audit)", () => {
  it("FT-09.1 (HU-084, HU-085, HU-192, HU-193, HU-281, HU-301, HU-403, HU-485): idempotencia por inbox, enlace diferido de devoluciones cruzadas (E23), ventas con precio anterior (E05) y conciliación de Nequi/DaviPlata", () => {
    const salesSvc = new SalesService();
    const tenantId = newId();
    const t0 = 1_760_000_000_000;

    // HU-192 (E05): A las 2:00 PM sube el precio a $2.300 en la nube
    salesSvc.latestCatalogPrices.set("prod-1", {
      price_cents: 230_000,
      updated_at_ms: t0
    });

    // HU-193 (E23): Llega primero la devolución referenciando C02-000105 (cuando la Caja 2 aún no ha subido la venta)
    const defRet = salesSvc.consumeSaleReturnedEvent({
      eventId: newId(),
      returnId: "ret-1",
      tenantId,
      manualReceiptRef: "C02-000105",
      lines: [{ product_id: "prod-1", qty_milli: 1000, refund_line_cents: 200_000 }],
      refundTotalCents: 200_000,
      occurredAtMs: t0 + 3600_000
    });
    expect(defRet.status).toBe("PENDING_ORIGINAL_SALE");

    // 2 horas después la Caja 2 sube la venta C02-000105 (vendida offline a $2.000) -> se enlaza automáticamente
    const evId = newId();
    const payNequiId = newId();
    const saleRes = salesSvc.consumeSaleCompletedEvent({
      eventId: evId,
      tenantId,
      branchId: "B1",
      terminalId: "C02",
      cashSessionId: "S1",
      cashierId: "cashier-1",
      saleId: "sale-105",
      receiptPrefix: "C02",
      receiptNumber: 105,
      totalCents: 400_000,
      lines: [
        {
          line_id: "l1",
          product_id: "prod-1",
          description: "Gaseosa",
          qty_milli: 2000,
          unit_price_cents: 200_000, // Precio anterior ($2.000 vs $2.300)
          line_total_cents: 400_000
        }
      ],
      payments: [
        {
          payment_id: payNequiId,
          method: "NEQUI",
          amount_cents: 400_000,
          reference: "M99911"
        }
      ],
      occurredAtMs: t0 + 1800_000
    });

    expect(saleRes.linkedDeferredReturnsCount).toBe(1);
    expect(saleRes.sale?.status).toBe("PARTIALLY_RETURNED");
    expect(saleRes.sale?.lines[0]?.returned_qty_milli).toBe(1000);
    expect(saleRes.sale?.lines[0]?.sold_with_stale_price).toBe(true);
    expect(salesSvc.returns.get("ret-1")?.status).toBe("LINKED");

    // HU-336: Reentrega triple del mismo evento es idempotente
    expect(
      salesSvc.consumeSaleCompletedEvent({
        eventId: evId,
        tenantId,
        branchId: "B1",
        terminalId: "C02",
        cashSessionId: "S1",
        cashierId: "cashier-1",
        saleId: "sale-105",
        receiptPrefix: "C02",
        receiptNumber: 105,
        totalCents: 400_000,
        lines: [],
        payments: [],
        occurredAtMs: t0 + 1800_000
      }).deduplicated
    ).toBe(true);

    // HU-085 & HU-403: Conciliación de pago Nequi marcado como FAILED
    const recRes = salesSvc.reconcilePaymentsBatch({
      tenantId,
      paymentIds: [payNequiId],
      status: "FAILED",
      actorId: "owner-1"
    });
    expect(recRes[0]?.reconciliation_status).toBe("FAILED");

    // HU-301 & HU-485: Lookup online del comprobante C02-000105
    expect(salesSvc.lookupReceipt(tenantId, "C02", 105)?.sale_id).toBe("sale-105");
  });

  it("FT-09.2 (HU-086, HU-087, HU-195, HU-302): recalculo independiente de server_expected_cash, detección de faltante, justificación y cierre forzado remoto", () => {
    const cashSvc = new CashService();
    cashSvc.openSession({
      cashSessionId: "sess-1",
      tenantId: "t1",
      branchId: "b1",
      terminalId: "c1",
      cashierId: "u1",
      openingFloatCents: 10_000_000 // $100.000
    });

    // Ventas netas en efectivo +$200.000 -> server_expected_cash = $300.000 (30.000.000 centavos)
    cashSvc.applyCashDeltaCents("sess-1", 20_000_000);

    // HU-086: Cierra declarando $275.000 (faltante -$25.000) -> emite cash.discrepancy.detected
    const closed = cashSvc.closeSessionAndVerify({
      cashSessionId: "sess-1",
      terminalReportedExpectedCents: 30_000_000,
      declaredCashCents: 27_500_000
    });
    expect(closed.discrepancyDetected).toBe(true);
    expect(closed.session.difference_cents).toBe(-2_500_000);

    // HU-195: El dueño registra justificación del descuadre
    const annotated = cashSvc.annotateDiscrepancyReview(
      "sess-1",
      "Cajero entregó recibo de taxi que olvidó registrar",
      "owner-1"
    );
    expect(annotated.review_note).toContain("recibo de taxi");

    // HU-087: Cierre forzado remoto de un turno olvidado abierto
    cashSvc.openSession({
      cashSessionId: "sess-open-forgot",
      tenantId: "t1",
      branchId: "b1",
      terminalId: "c1",
      cashierId: "u1",
      openingFloatCents: 5_000_000
    });
    const forced = cashSvc.forceCloseSessionRemotely(
      "sess-open-forgot",
      "Cajero olvidó cerrar turno ayer",
      "owner-1"
    );
    expect(forced.status).toBe("FORCE_CLOSED");
  });

  it("FT-09.3 (HU-088..HU-092, HU-194, HU-280, HU-303, HU-304, HU-356, HU-400..HU-402, HU-447): deltas conmutativos entre 2 cajas offline (E04), costo promedio ponderado, conteo físico as_of sin pisar ventas posteriores, traslados con diferencia y rebuild-projection", () => {
    const inv = new InventoryService();
    const tenantId = "t-inv";
    const w1 = "w-main";
    const w2 = "w-sur";
    const prodGaseosa = "prod-gas";
    const prodArroz = "prod-arz";

    // HU-088 & HU-280 (E04): Stock inicial 4 unidades; Caja 1 vende 2 y Caja 2 vende 3 offline -> queda en -1 y emite alerta
    inv.recordInitialStock({
      tenantId,
      warehouseId: w1,
      productId: prodGaseosa,
      qtyMilli: 4000,
      unitCostCents: 200_000,
      occurredAtMs: 1000
    });

    inv.applySaleOrReturnDelta({
      eventId: "ev-c1",
      tenantId,
      warehouseId: w1,
      productId: prodGaseosa,
      trackStock: true,
      deltaMilli: -2000,
      kind: "SALE",
      occurredAtMs: 2000
    });
    const resC2 = inv.applySaleOrReturnDelta({
      eventId: "ev-c2",
      tenantId,
      warehouseId: w1,
      productId: prodGaseosa,
      trackStock: true,
      deltaMilli: -3000,
      kind: "SALE",
      occurredAtMs: 2100
    });
    expect(resC2.onHandMilli).toBe(-1000);
    expect(resC2.negativeAlertEmitted).toBe(true);

    // HU-303: Producto con trackStock = false se ignora
    const resGen = inv.applySaleOrReturnDelta({
      eventId: "ev-gen",
      tenantId,
      warehouseId: w1,
      productId: "generic-1",
      trackStock: false,
      deltaMilli: -1000,
      kind: "SALE",
      occurredAtMs: 2200
    });
    expect(resGen.ignored).toBe(true);

    // HU-089: Costo promedio ponderado: 10 uds a $2.000 + entrada de 10 uds a $2.400 -> 20 uds a $2.200
    inv.recordInitialStock({
      tenantId,
      warehouseId: w1,
      productId: prodArroz,
      qtyMilli: 10_000,
      unitCostCents: 200_000,
      occurredAtMs: 3000
    });
    const afterReceipt = inv.recordPurchaseReceipt({
      tenantId,
      warehouseId: w1,
      productId: prodArroz,
      qtyMilli: 10_000,
      unitCostCents: 240_000,
      paidFromCashSessionId: "sess-1",
      batchExpiryDate: "2026-12-31",
      occurredAtMs: 4000
    });
    expect(afterReceipt.on_hand_milli).toBe(20_000);
    expect(afterReceipt.avg_cost_cents).toBe(220_000); // $2.200

    // HU-091: Conteo físico tomado a las 10:00 (t=5000) cuenta 18 uds (cuando el teórico era 20 -> ajuste = -2),
    // mientras una caja vendió 3 uds a las 10:15 (t=6000) -> stock final = 20 - 2 - 3 = 15 uds
    inv.applySaleOrReturnDelta({
      eventId: "ev-1015",
      tenantId,
      warehouseId: w1,
      productId: prodArroz,
      trackStock: true,
      deltaMilli: -3000,
      kind: "SALE",
      occurredAtMs: 6000
    });
    const countRes = inv.applyPhysicalCountAsOf({
      tenantId,
      warehouseId: w1,
      productId: prodArroz,
      countedQtyMilli: 18_000,
      asOfMs: 5000 // Conteo tomado en t=5000 antes de la venta de t=6000
    });
    expect(countRes.adjustmentDeltaMilli).toBe(-2000);
    expect(countRes.finalOnHandMilli).toBe(15_000);

    // HU-092 & HU-402: Traslado entre sucursales de 12 unidades donde llegan 11 -> RECEIVED_WITH_DIFF
    const tr = inv.dispatchWarehouseTransfer({
      tenantId,
      fromWarehouseId: w1,
      toWarehouseId: w2,
      productId: prodArroz,
      qtyMilli: 12_000,
      nowMs: 7000
    });
    const recTr = inv.receiveWarehouseTransfer({
      transferId: tr.id,
      receivedQtyMilli: 11_000,
      diffNote: "1 bolsa rota en transporte",
      nowMs: 8000
    });
    expect(recTr.status).toBe("RECEIVED_WITH_DIFF");
    expect(inv.getOrCreateLevel(tenantId, w2, prodArroz).on_hand_milli).toBe(11_000);

    // HU-194: rebuildStockLevelsFromMovements reconstruye exactamente los mismos saldos
    inv.rebuildStockLevelsFromMovements(tenantId);
    expect(inv.getOrCreateLevel(tenantId, w1, prodArroz).on_hand_milli).toBe(3000);
    expect(inv.getOrCreateLevel(tenantId, w2, prodArroz).on_hand_milli).toBe(11_000);
  });

  it("FT-09.4 & FT-09.5 (HU-093..HU-095, HU-305, HU-363, HU-398, HU-399, HU-446, HU-459): cuaderno de fiados inicial, exceso de cupo entre 2 cajas (E07), cupo ALLOCATED, castigo WRITE_OFF, Derechos ARCO y cadena SHA-256 WORM en audit-service", () => {
    const custSvc = new CustomerService();
    const tenantId = "t-cust";
    custSvc.tenantMaxCreditCustomers.set(tenantId, 50);

    // HU-446: Carga de cliente desde el cuaderno de fiados con saldo inicial de $60.000 y cupo de $100.000
    const pedro = custSvc.upsertCustomerWithOptionalInitialBalance({
      tenantId,
      fullName: "Don Pedro",
      docType: "CC",
      docNumber: "19123456",
      creditEnabled: true,
      creditLimitCents: 10_000_000, // $100.000
      initialBalanceCents: 6_000_000 // $60.000
    });
    expect(pedro.balance_cents).toBe(6_000_000);

    // HU-305: Modo ALLOCATED con $40.000 disponibles y 2 cajas activas asigna $20.000 por caja
    expect(custSvc.computeAllocatedCreditPerTerminalCents(pedro.id, 2)).toBe(2_000_000);

    // HU-093 (E07): Caja 1 fía $30.000 y Caja 2 fía $25.000 offline -> saldo pasa a $115.000 y emite customer.credit_limit_exceeded
    custSvc.applyCreditMovementEvent({
      eventId: "ev-f1",
      tenantId,
      customerId: pedro.id,
      kind: "CHARGE",
      deltaCents: 3_000_000,
      occurredAtMs: 1000
    });
    const f2 = custSvc.applyCreditMovementEvent({
      eventId: "ev-f2",
      tenantId,
      customerId: pedro.id,
      kind: "CHARGE",
      deltaCents: 2_500_000,
      occurredAtMs: 1100
    });
    expect(f2.newBalanceCents).toBe(11_500_000);
    expect(f2.limitExceededEmitted).toBe(true);

    // HU-094 & HU-363: No permite suprimir datos personales mientras tenga deuda activa
    expect(() => custSvc.suppressCustomerPersonalData(tenantId, pedro.id)).toThrow(
      "409 CANNOT_SUPPRESS_DATA_WITH_ACTIVE_DEBT"
    );

    // HU-094 & HU-399: Castigo de cartera (WRITE_OFF) con MFA deja el saldo en $0 y luego sí permite anonimizar por Habeas Data
    custSvc.writeOffCustomerDebt({
      tenantId,
      customerId: pedro.id,
      reason: "Cliente se mudó de ciudad",
      mfaVerified: true
    });
    expect(pedro.balance_cents).toBe(0);
    const anon = custSvc.suppressCustomerPersonalData(tenantId, pedro.id);
    expect(anon.anonymized).toBe(true);
    expect(anon.phone).toBeNull();

    // FT-09.5 (HU-095, HU-459): cadena SHA-256 y alertas de exportación; UPDATE/DELETE se verifican en PostgreSQL (db-migrations)
    const audit = new AuditService();
    for (let i = 1; i <= 6; i++) {
      audit.appendAuditEntry({
        tenantId,
        actorId: "user-1",
        action: "reports.export.requested",
        details: { report: "sales", attempt: i }
      });
    }
    expect(audit.verifyTenantChainIntegrity(tenantId)).toEqual({ valid: true });
    expect(audit.securityAlerts).toHaveLength(1); // HU-459: > 5 exportaciones seguidas
  });
});
