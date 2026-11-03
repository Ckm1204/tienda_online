import { describe, it, expect } from "vitest";
import { newId, computeGs1CheckDigit } from "@tiendita/contracts";
import {
  InMemoryOsKeystore,
  EncryptedPosStorage,
  PosSecurityAndAuthKernel,
  hashPin,
  EscPosPrinterAndPeripherals,
  sanitizeEscPosUserText,
  formatFixedWidthItemLines,
  PosCashSessionManager,
  PosCustomersAndCreditManager,
  PosSalesAndCartEngine
} from "../index.js";

function setupPosContext() {
  const storage = new EncryptedPosStorage(new InMemoryOsKeystore());
  storage.openWithKeystore();
  const auth = new PosSecurityAndAuthKernel(storage);

  const ownerId = newId();
  const supId = newId();
  const cashierId = newId();

  auth.upsertLocalUser({
    id: ownerId,
    full_name: "Doña María",
    pin_hash: hashPin("9876"),
    status: "ACTIVE",
    role_codes: ["OWNER"],
    permissions: [
      "sale.create",
      "sale.void",
      "sale.return",
      "sale.generic_item",
      "sale.discount.extraordinary",
      "sale.price.override",
      "cash.session.open_close",
      "cash.session.reopen",
      "cash.session.view_expected",
      "cash.movement.out",
      "credit.exceed_limit"
    ],
    failed_pin_attempts: 0,
    locked_until_ms: null
  });

  auth.upsertLocalUser({
    id: supId,
    full_name: "Luisa Supervisora",
    pin_hash: hashPin("5544"),
    status: "ACTIVE",
    role_codes: ["SUPERVISOR"],
    permissions: [
      "sale.create",
      "sale.void",
      "sale.return",
      "sale.generic_item",
      "sale.discount.extraordinary",
      "sale.price.override",
      "cash.session.open_close",
      "cash.session.reopen",
      "cash.movement.out",
      "credit.exceed_limit"
    ],
    failed_pin_attempts: 0,
    locked_until_ms: null
  });

  auth.upsertLocalUser({
    id: cashierId,
    full_name: "Carlos Cajero",
    pin_hash: hashPin("4829"),
    status: "ACTIVE",
    role_codes: ["CASHIER"],
    permissions: ["sale.create", "cash.session.open_close"],
    failed_pin_attempts: 0,
    locked_until_ms: null
  });

  auth.deviceState = {
    tenant_id: newId(),
    branch_id: newId(),
    terminal_id: newId(),
    warehouse_id: newId(),
    receipt_prefix: "C01",
    next_receipt_number: 42,
    next_terminal_seq: 100,
    plan_code: "NEGOCIO",
    fiscal_mode: "NONE",
    features: { credit: true, promotions: true },
    license_token: "ok",
    license_status: "ACTIVE",
    license_issued_at_ms: 1_760_000_000_000,
    license_expires_at_ms: 1_770_000_000_000,
    grace_days: 10,
    max_seen_local_time_ms: 1_760_000_000_000,
    revoked: false
  };

  const printer = new EscPosPrinterAndPeripherals({
    printerConnection: "USB",
    printerNameOrIp: "POS-58",
    paperWidthMm: 58,
    cutPaper: true,
    hasCashDrawer: true,
    drawerConnection: "PRINTER_RJ11",
    scaleSerialPort: "COM3",
    logoMonochromeEnabled: true
  });

  const cash = new PosCashSessionManager(storage, auth);
  const customers = new PosCustomersAndCreditManager(storage, auth, cash);
  const sales = new PosSalesAndCartEngine(storage, auth, cash, customers, printer);

  return { storage, auth, printer, cash, customers, sales, ownerId, supId, cashierId };
}

describe("ÉPICAS 03, 04, 05 y 06 — Ventas Offline, Periféricos ESC/POS, Turnos/Arqueo Ciego y Fiados", () => {
  it("EP-04 (HU-048..HU-052, HU-343..HU-349, HU-453, HU-474): formatea 58mm (32 col) sin cortar precios, sanitiza bytes ESC/POS maliciosos, encola sin papel y reconecta por USB, abre cajón solo con efectivo y lee balanza COM3", () => {
    const { printer } = setupPosContext();

    // HU-474: Sanitiza inyección de byte ESC (0x1b 0x70) en nombre de producto/cliente
    const malicious = "Arroz\x1b\x70\x00Diana";
    expect(sanitizeEscPosUserText(malicious)).toBe("ArrozDiana");

    // HU-344: Producto con nombre de 45 caracteres en papel de 58 mm (32 columnas)
    const lines = formatFixedWidthItemLines(
      "Detergente Líquido Ariel Concentrado 1.8 Litros",
      "$ 24.900",
      58
    );
    expect(lines.length).toBeGreaterThanOrEqual(2);
    const lastLine = lines[lines.length - 1]!;
    expect(lastLine.length).toBe(32);
    expect(lastLine.endsWith("$ 24.900")).toBe(true);

    // HU-050 & HU-343: Impresora sin papel encola el trabajo y al reconectar lo imprime sin duplicar
    printer.paperOut = true;
    const qRes = printer.printOrEnqueue("TIQUETE-1");
    expect(qRes).toEqual({ printedImmediately: false, queuedCount: 1 });
    expect(printer.printedJobs).toHaveLength(0);

    const flushed = printer.reconnectUsbAndRetryQueue();
    expect(flushed).toBe(1);
    expect(printer.printedJobs).toEqual(["TIQUETE-1"]);

    // HU-051 & HU-453: Pago 100% Nequi NO abre cajón; pago con efectivo SÍ abre cajón (incluyendo USB-Serial COM4)
    expect(printer.pulseCashDrawerIfApplicable(false)).toBe(false);
    expect(printer.drawerOpenPulsesSent).toBe(0);

    printer.config.drawerConnection = "USB_SERIAL";
    printer.config.drawerSerialPort = "COM4";
    expect(printer.pulseCashDrawerIfApplicable(true)).toBe(true);
    expect(printer.drawerOpenPulsesSent).toBe(1);
    expect(printer.lastSerialDrawerPortUsed).toBe("COM4");

    // HU-052: Lectura de peso estable desde balanza en COM3
    printer.setSimulatedScaleWeightGrams(640);
    expect(printer.readStableWeightFromScale()).toEqual({
      port: "COM3",
      weightGrams: 640,
      qtyMilliKg: 640
    });
  });

  it("EP-05 (HU-053..HU-058, HU-205..HU-209, HU-222, HU-223, HU-326, HU-419, HU-420, HU-450, HU-451): abre turno, oculta esperado al cajero, valida salidas/safe drop, calcula arqueo ciego exacto e imprime Reporte X/Z y reapertura", () => {
    const { auth, cash, ownerId, supId, cashierId } = setupPosContext();
    const t0 = 1_760_000_000_000;

    // HU-053 & HU-222: Apertura de turno contando billetes ($100.000 = 10.000.000 centavos)
    const session = cash.cmdOpenCashSession({
      openedBy: cashierId,
      openingDenominations: { BILL_50000: 1, BILL_20000: 2, BILL_10000: 1 },
      nowMs: t0
    });
    expect(session.opening_float_cents).toBe(10_000_000);

    // Impedir segundo turno simultáneo
    expect(() =>
      cash.cmdOpenCashSession({ openedBy: cashierId, openingFloatCents: 5_000_000, nowMs: t0 + 10 })
    ).toThrow("CASH_SESSION_ALREADY_OPEN");

    // Simular movimientos del escenario Gherkin HU-057:
    // Base $100.000 + Ventas efectivo $450.000 - Cambio $120.000 + Abonos $30.000 - Pago proveedor $50.000 - Safe drop $150.000 - Devolución $10.000 = $250.000
    cash.movements.push(
      {
        id: newId(),
        cash_session_id: session.id,
        kind: "SALE_CASH",
        amount_cents: 45_000_000,
        reason: "Ventas",
        approved_by: null,
        created_by: cashierId,
        occurred_at_ms: t0 + 100,
        voided: false
      },
      {
        id: newId(),
        cash_session_id: session.id,
        kind: "CHANGE_GIVEN",
        amount_cents: 12_000_000,
        reason: "Cambio",
        approved_by: null,
        created_by: cashierId,
        occurred_at_ms: t0 + 100,
        voided: false
      },
      {
        id: newId(),
        cash_session_id: session.id,
        kind: "CREDIT_PAYMENT_CASH",
        amount_cents: 3_000_000,
        reason: "Abonos",
        approved_by: null,
        created_by: cashierId,
        occurred_at_ms: t0 + 200,
        voided: false
      },
      {
        id: newId(),
        cash_session_id: session.id,
        kind: "REFUND_CASH",
        amount_cents: 1_000_000,
        reason: "Devolución",
        approved_by: supId,
        created_by: cashierId,
        occurred_at_ms: t0 + 300,
        voided: false
      }
    );

    // HU-054: Salida pago a proveedor de $50.000 supera el umbral ($20.000) -> exige aprobación
    expect(() =>
      cash.cmdRecordCashMovement({
        cashSessionId: session.id,
        kind: "SUPPLIER_PAYMENT",
        amountCents: 5_000_000,
        reason: "Panadería El Trigo",
        createdBy: cashierId,
        nowMs: t0 + 400
      })
    ).toThrow("APPROVAL_REQUIRED");

    const supMovNonce = auth.cmdVerifyApproverPin({
      requestedByUserId: cashierId,
      approverUserId: supId,
      approverPin: "5544",
      permissionCode: "cash.movement.out",
      nowMs: t0 + 400
    });
    cash.cmdRecordCashMovement({
      cashSessionId: session.id,
      kind: "SUPPLIER_PAYMENT",
      amountCents: 5_000_000,
      reason: "Panadería El Trigo",
      createdBy: cashierId,
      approvalNonce: supMovNonce.approvalNonce,
      nowMs: t0 + 400
    });

    // HU-055: Retiro parcial (SAFE_DROP) de $150.000
    const dropNonce = auth.cmdVerifyApproverPin({
      requestedByUserId: cashierId,
      approverUserId: supId,
      approverPin: "5544",
      permissionCode: "cash.movement.out",
      nowMs: t0 + 500
    });
    cash.cmdRecordCashMovement({
      cashSessionId: session.id,
      kind: "SAFE_DROP",
      amountCents: 15_000_000,
      reason: "Retiro a caja fuerte",
      createdBy: cashierId,
      approvalNonce: dropNonce.approvalNonce,
      nowMs: t0 + 500
    });

    // HU-419: Rechazo si intentan sacar más efectivo del que hay en gaveta ($250.000 disponibles)
    expect(() =>
      cash.cmdRecordCashMovement({
        cashSessionId: session.id,
        kind: "CASH_OUT",
        amountCents: 30_000_000,
        reason: "Exceso",
        createdBy: cashierId,
        nowMs: t0 + 600
      })
    ).toThrow("INSUFFICIENT_CASH_IN_DRAWER");

    // HU-208 & HU-326: El cajero sin permiso cash.session.view_expected recibe expected_cash_cents = null
    const cashierSessionView = cash.cmdGetOpenCashSession(t0 + 700, ["sale.create"]);
    expect(cashierSessionView?.session.expected_cash_cents).toBeNull();

    // HU-451: El dueño sí puede sacar Corte Parcial Reporte X ($250.000 = 25.000.000 centavos)
    const xNonce = auth.cmdVerifyApproverPin({
      requestedByUserId: cashierId,
      approverUserId: ownerId,
      approverPin: "9876",
      permissionCode: "cash.session.view_expected",
      nowMs: t0 + 700
    });
    const repX = cash.cmdGenerateReportX({
      cashSessionId: session.id,
      approvalNonce: xNonce.approvalNonce,
      nowMs: t0 + 700
    });
    expect(repX.expectedCashCents).toBe(25_000_000); // $250.000 exactos

    // HU-420: Si hay carritos en espera sin confirmar descarte, advierte antes de cerrar turno
    expect(() =>
      cash.cmdCloseCashSessionBlind({
        cashSessionId: session.id,
        closedBy: cashierId,
        declaredDenominations: { BILL_50000: 5 },
        parkedCartsCount: 1,
        nowMs: t0 + 800
      })
    ).toThrow("PARKED_CARTS_PENDING_CONFIRMATION");

    // HU-056 & HU-057: Arqueo ciego declarando $247.500 (faltante de -$2.500 = -250.000 centavos)
    const closed = cash.cmdCloseCashSessionBlind({
      cashSessionId: session.id,
      closedBy: cashierId,
      declaredDenominations: {
        BILL_100000: 2,
        BILL_20000: 2,
        BILL_5000: 1,
        BILL_2000: 1,
        COIN_500: 1
      },
      nowMs: t0 + 900
    });
    expect(closed.expected_cash_cents).toBe(25_000_000);
    expect(closed.declared_cash_cents).toBe(24_750_000);
    expect(closed.difference_cents).toBe(-250_000);

    // HU-058 & HU-209: Reapertura auditada del último turno cerrado con PIN de supervisor
    const reopenNonce = auth.cmdVerifyApproverPin({
      requestedByUserId: cashierId,
      approverUserId: supId,
      approverPin: "5544",
      permissionCode: "cash.session.reopen",
      nowMs: t0 + 1000
    });
    const reopened = cash.cmdReopenCashSession({
      cashSessionId: session.id,
      reopenedBy: cashierId,
      approvalNonce: reopenNonce.approvalNonce,
      reason: "Olvidó contar un billete de $2.000 y una moneda de $500",
      nowMs: t0 + 1000
    });
    expect(reopened.status).toBe("REOPENED");
    expect(reopened.reopen_history).toHaveLength(1);
  });

  it("EP-06 (HU-059..HU-062, HU-216, HU-217, HU-324, HU-325, HU-355, HU-449): alta rápida con Habeas Data, autorizados de fiado, modos de cupo SOFT/ALLOCATED, abonos y anulación de abono", () => {
    const { auth, cash, customers, supId, cashierId } = setupPosContext();
    const t0 = 1_760_000_000_000;
    const session = cash.cmdOpenCashSession({
      openedBy: cashierId,
      openingFloatCents: 10_000_000,
      nowMs: t0
    });

    // HU-059: Alta rápida exige aceptación de Habeas Data si lleva teléfono
    expect(() =>
      customers.cmdCreateQuickCustomer({
        fullName: "Marta Gómez",
        alias: "Doña Marta",
        phone: "3105551234",
        dataConsentAccepted: false,
        nowMs: t0 + 10
      })
    ).toThrow(/Habeas Data/);

    const marta = customers.cmdCreateQuickCustomer({
      fullName: "Marta Gómez",
      alias: "Doña Marta",
      docType: "CC",
      docNumber: "52123456",
      phone: "3105551234",
      dataConsentAccepted: true,
      authorizedPickups: ["Marta Gómez", "Camilo (Hijo)"],
      warningNote: "No fiar al sobrino",
      nowMs: t0 + 20
    });
    expect(marta.credit_enabled).toBe(false);

    // HU-216: Deduplicación por documento devuelve la misma clienta
    const dup = customers.cmdCreateQuickCustomer({
      fullName: "Marta G",
      docType: "CC",
      docNumber: "52123456",
      dataConsentAccepted: true,
      nowMs: t0 + 30
    });
    expect(dup.id).toBe(marta.id);

    // Habilitar cupo de $100.000 y saldo servidor de $30.000
    marta.credit_enabled = true;
    marta.credit_limit_cents = 10_000_000;
    marta.server_balance_cents = 3_000_000;

    // HU-355: Rechazar si intenta retirar el pedido alguien NO autorizado ("Sobrino")
    expect(() =>
      customers.validateAndRecordCreditCharge({
        customerId: marta.id,
        chargeAmountCents: 1_200_000,
        saleId: newId(),
        pickupPerson: "Sobrino",
        nowMs: t0 + 40
      })
    ).toThrow("UNAUTHORIZED_PICKUP_PERSON:Sobrino");

    // Cargo autorizado a "Camilo (Hijo)" por +$12.000 y abono por -$5.000 -> saldo estimado = $37.000
    customers.validateAndRecordCreditCharge({
      customerId: marta.id,
      chargeAmountCents: 1_200_000,
      saleId: newId(),
      pickupPerson: "Camilo (Hijo)",
      nowMs: t0 + 50
    });
    const payRes = customers.cmdRecordCreditPayment({
      customerId: marta.id,
      cashSessionId: session.id,
      amountCents: 500_000,
      method: "CASH",
      receivedBy: cashierId,
      nowMs: t0 + 60
    });
    expect(payRes.newBalanceCents).toBe(3_700_000); // $37.000

    // HU-060 & HU-448: Búsqueda sin tilde ("dona marta") devuelve saldo estimado $37.000 y disponible $63.000
    const found = customers.cmdSearchCustomers("dona marta")[0]!;
    expect(found.estimatedBalanceCents).toBe(3_700_000);
    expect(found.availableCreditCents).toBe(6_300_000);

    // HU-061: Exceso de cupo en modo SOFT exige PIN de supervisor
    expect(() =>
      customers.validateAndRecordCreditCharge({
        customerId: marta.id,
        chargeAmountCents: 7_000_000, // $37k + $70k = $107k > $100k
        saleId: newId(),
        nowMs: t0 + 70
      })
    ).toThrow("CREDIT_LIMIT_EXCEEDED_APPROVAL_REQUIRED");

    const exceedNonce = auth.cmdVerifyApproverPin({
      requestedByUserId: cashierId,
      approverUserId: supId,
      approverPin: "5544",
      permissionCode: "credit.exceed_limit",
      nowMs: t0 + 70
    });
    const exceeded = customers.validateAndRecordCreditCharge({
      customerId: marta.id,
      chargeAmountCents: 7_000_000,
      saleId: newId(),
      approvalNonce: exceedNonce.approvalNonce,
      nowMs: t0 + 70
    });
    expect(exceeded.newBalanceCents).toBe(10_700_000);

    // HU-449: Anulación de abono registrado por error restaura deuda y ajusta caja del turno
    const voidPayNonce = auth.cmdVerifyApproverPin({
      requestedByUserId: cashierId,
      approverUserId: supId,
      approverPin: "5544",
      permissionCode: "sale.void",
      nowMs: t0 + 80
    });
    const afterVoid = customers.cmdVoidCreditPayment({
      movementId: payRes.movementId,
      cashSessionId: session.id,
      approvalNonce: voidPayNonce.approvalNonce,
      reason: "Cliente equivocado",
      nowMs: t0 + 80
    });
    expect(afterVoid.restoredBalanceCents).toBe(11_200_000);
  });

  it("EP-03 (HU-033..HU-047, HU-168..HU-180, HU-210..HU-215, HU-278, HU-325, HU-353, HU-415, HU-417, HU-452, HU-454): escaneo paca/balanza, búsqueda FTS, genérico, descuentos, cobro atómico idempotente, pagos mixtos, corte de luz, devoluciones y cambios", () => {
    const { storage, auth, printer, cash, customers, sales, supId, cashierId } = setupPosContext();
    const t0 = 1_760_000_000_000;
    const session = cash.cmdOpenCashSession({
      openedBy: cashierId,
      openingFloatCents: 10_000_000,
      nowMs: t0
    });

    const prodArrozId = newId();
    const prodQuesoId = newId();
    const prodCervezaId = newId();
    const prodEnvaseId = newId();

    sales.upsertProduct(
      {
        id: prodArrozId,
        sku: "ARZ500",
        name: "Arroz Diana Bolsa 500g",
        category_id: null,
        unit: "UND",
        is_weighted: false,
        track_stock: true,
        allow_negative_stock: true,
        taxes: [{ code: "IVA5", kind: "PERCENT", rate_bp: 500 }],
        price_cents: 250_000, // $2.500
        status: "ACTIVE",
        deleted: false
      },
      [
        { barcode: "7702004003508", pack_qty_milli: 1000 },
        { barcode: "17702004003505", pack_qty_milli: 6000 } // Six-pack / paca x6 (HU-037)
      ]
    );

    sales.upsertProduct({
      id: prodQuesoId,
      sku: "01045",
      name: "Queso Campesino",
      category_id: null,
      unit: "KG",
      is_weighted: true,
      track_stock: true,
      allow_negative_stock: true,
      taxes: [{ code: "EXCLUIDO", kind: "PERCENT", rate_bp: 0 }],
      price_cents: 2_400_000, // $24.000 / kg
      status: "ACTIVE",
      deleted: false
    });

    sales.upsertProduct(
      {
        id: prodCervezaId,
        sku: "CERV330",
        name: "Cerveza Águila 330ml Retornable",
        category_id: null,
        unit: "UND",
        is_weighted: false,
        track_stock: true,
        allow_negative_stock: true,
        taxes: [{ code: "EXCLUIDO", kind: "PERCENT", rate_bp: 0 }],
        price_cents: 300_000,
        returnable_bottle_product_id: prodEnvaseId,
        returnable_deposit_cents: 100_000,
        status: "ACTIVE",
        deleted: false
      },
      [{ barcode: "7702001001002", pack_qty_milli: 1000 }]
    );

    // HU-211 & HU-448: Búsqueda con palabras desordenadas y sin tilde ("500 diana")
    const searchRes = sales.cmdSearchProducts("500 diana");
    expect(searchRes[0]?.product.name).toBe("Arroz Diana Bolsa 500g");

    // HU-169 & HU-037: Multiplicador "2*17702004003505" (2 pacas de 6 = 12 unidades = 12.000 milésimas)
    const packLookup = sales.cmdLookupBarcode("2*17702004003505");
    expect(packLookup.qtyMilli).toBe(12_000);

    // HU-036 & HU-171: Etiqueta EAN-13 de balanza con peso embebido (prefijo 20 + SKU 01045 + 00375 gramos)
    const bodyWeight = "200104500375";
    const weightBarcode = `${bodyWeight}${computeGs1CheckDigit(bodyWeight)}`;
    const weightLookup = sales.cmdLookupBarcode(weightBarcode);
    expect(weightLookup.product.id).toBe(prodQuesoId);
    expect(weightLookup.qtyMilli).toBe(375);

    // HU-415: Cliente pide "$3.000 de queso" a $24.000/kg -> 125 gramos
    const byPesos = sales.calculateWeightByRequestedAmountCents(prodQuesoId, 300_000);
    expect(byPesos.gramsToDeliver).toBe(125);

    // HU-038: Agregar artículo genérico con aprobación de supervisor
    const genNonce = auth.cmdVerifyApproverPin({
      requestedByUserId: cashierId,
      approverUserId: supId,
      approverPin: "5544",
      permissionCode: "sale.generic_item",
      nowMs: t0
    });
    const genericItem = sales.cmdAddGenericItemToCart({
      description: "Ponqué Ramo nuevo",
      unitPriceCents: 320_000,
      approvalNonce: genNonce.approvalNonce,
      nowMs: t0
    });
    expect(genericItem.is_generic_item).toBe(true);

    // HU-042: Suspender y reanudar carrito en espera sin consumir consecutivo
    const parked = sales.cmdParkCart({
      cashierId,
      label: "Señor camisa azul",
      items: [genericItem],
      nowMs: t0
    });
    expect(auth.deviceState!.next_receipt_number).toBe(42);
    const resumedItems = sales.cmdResumeParkedCart(parked.id);
    expect(resumedItems).toHaveLength(1);

    // HU-278 (E02): Si se va la luz antes del COMMIT, no se consume número ni queda venta a medias
    expect(() =>
      sales.cmdCompleteSale({
        cartId: "cart-power-cut",
        cashSessionId: session.id,
        cashierId,
        cashierName: "Carlos",
        items: resumedItems,
        payments: [{ method: "CASH", amountCents: 320_000, tenderedCents: 320_000 }],
        simulatePowerCutBeforeCommit: true,
        nowMs: t0 + 100
      })
    ).toThrow("SIMULATED_POWER_CUT_BEFORE_COMMIT_ROLLED_BACK");
    expect(auth.deviceState!.next_receipt_number).toBe(42);

    // HU-043 & HU-044: Cobro atómico con pagos mixtos ($2.000 Efectivo recibiendo $5.000 + $3.000 Nequi = $5.000 total)
    const arrozLine = {
      line_id: newId(),
      product_id: prodArrozId,
      description: "Arroz Diana Bolsa 500g",
      qty_milli: 2000, // 2 unidades x $2.500 = $5.000
      unit_price_cents: 250_000,
      discount_cents: 0,
      taxes: [{ code: "IVA5", kind: "PERCENT" as const, rate_bp: 500 }],
      is_generic_item: false
    };

    const saleRes = sales.cmdCompleteSale({
      cartId: "cart-ok-1",
      cashSessionId: session.id,
      cashierId,
      cashierName: "Carlos",
      items: [arrozLine],
      payments: [
        { method: "CASH", amountCents: 200_000, tenderedCents: 500_000 },
        { method: "NEQUI", amountCents: 300_000, reference: "M48192" }
      ],
      nowMs: t0 + 200
    });

    expect(saleRes.sale.receipt_code).toBe("C01-000042");
    expect(saleRes.combinedChangeCents).toBe(300_000); // $3.000 de cambio
    expect(saleRes.drawerOpened).toBe(true);
    expect(sales.getEstimatedStockMilli(prodArrozId)).toBe(-2000);

    // HU-043 (E29): Doble clic sobre el mismo cartId devuelve la misma venta C01-000042 sin duplicar
    const doubleClick = sales.cmdCompleteSale({
      cartId: "cart-ok-1",
      cashSessionId: session.id,
      cashierId,
      cashierName: "Carlos",
      items: [arrozLine],
      payments: [
        { method: "CASH", amountCents: 200_000, tenderedCents: 500_000 },
        { method: "NEQUI", amountCents: 300_000, reference: "M48192" }
      ],
      nowMs: t0 + 201
    });
    expect(doubleClick.sale.id).toBe(saleRes.sale.id);
    expect(auth.deviceState!.next_receipt_number).toBe(43);

    // HU-046 & HU-215: Devolución parcial de 1 unidad repone stock (+1) y bloquea devolver 2 más sobre la misma venta
    const retNonce1 = auth.cmdVerifyApproverPin({
      requestedByUserId: cashierId,
      approverUserId: supId,
      approverPin: "5544",
      permissionCode: "sale.return",
      nowMs: t0 + 300
    });
    sales.cmdReturnOrVoidSale({
      originalSaleId: saleRes.sale.id,
      cashSessionId: session.id,
      kind: "PARTIAL_RETURN",
      linesToReturn: [{ product_id: prodArrozId, qty_milli: 1000, refund_line_cents: 250_000 }],
      refundMethod: "CASH",
      reason: "Empaque roto",
      requestedBy: cashierId,
      approvalNonce: retNonce1.approvalNonce,
      nowMs: t0 + 300
    });
    expect(sales.getEstimatedStockMilli(prodArrozId)).toBe(-1000);

    const retNonce2 = auth.cmdVerifyApproverPin({
      requestedByUserId: cashierId,
      approverUserId: supId,
      approverPin: "5544",
      permissionCode: "sale.return",
      nowMs: t0 + 310
    });
        expect(() =>
      sales.cmdReturnOrVoidSale({
        originalSaleId: saleRes.sale.id,
        cashSessionId: session.id,
        kind: "PARTIAL_RETURN",
        linesToReturn: [{ product_id: prodArrozId, qty_milli: 2000, refund_line_cents: 500_000 }],
        refundMethod: "CASH",
        reason: "Exceso",
        requestedBy: cashierId,
        approvalNonce: retNonce2.approvalNonce,
        nowMs: t0 + 310
      })
    ).toThrow("RETURN_QTY_EXCEEDS_SOLD_QTY");

    // HU-047: Cambio mano a mano con cobro de diferencia en efectivo y pulso a cajón
    const exchangeNonce = auth.cmdVerifyApproverPin({
      requestedByUserId: cashierId,
      approverUserId: supId,
      approverPin: "5544",
      permissionCode: "sale.return",
      nowMs: t0 + 350
    });

    const exchRes = sales.cmdExchangeProduct({
      returnedProductId: prodArrozId, // Devuelve 1 Arroz ($2.500)
      returnedQtyMilli: 1000,
      returnedPriceCents: 250_000,
      newProductId: prodCervezaId, // Lleva 1 Cerveza ($3.000)
      newQtyMilli: 1000,
      newPriceCents: 300_000,
      approvalNonce: exchangeNonce.approvalNonce,
      cashSessionId: session.id,
      paymentMethod: "CASH",
      requestedBy: cashierId,
      nowMs: t0 + 350
    });

    expect(exchRes.differenceToPayCents).toBe(50_000); // $500 COP de diferencia a cobrar
    expect(exchRes.drawerOpened).toBe(true);

    // Comprobante ESC/POS de cambio (Ley 1480 de 2011)
    const exchSlip = printer.renderExchangeSlipText({
      exchangeCode: exchRes.exchangeId,
      returnedItemName: "Arroz Diana Bolsa 500g",
      returnedQtyMilli: 1000,
      returnedValueCents: 250_000,
      newItemName: "Cerveza Águila 330ml Retornable",
      newQtyMilli: 1000,
      newValueCents: 300_000,
      differenceCents: 50_000,
      paymentMethod: "EFECTIVO",
      supervisorName: "Luisa Supervisora",
      occurredAtIso: "2026-11-02T15:30:00-05:00"
    });
    expect(exchSlip).toContain("TIQUETE DE CAMBIO DE PRODUCTO");
    expect(exchSlip).toContain("(Ley 1480 de 2011 - Estatuto del Consumidor)");
    expect(exchSlip).toContain("DIFERENCIA COBRADA: $ 500 (EFECTIVO)");
  });

  it("Art. 616 E.T.: Maqueta Reporte Z de Cierre Fiscal Diario en tirilla térmica de 80mm y 58mm", () => {
    const { printer } = setupPosContext();

    const slip80 = printer.renderReportZSlipText({
      businessName: "Supertienda El Éxito",
      nit: "900.123.456-7",
      terminalCode: "CAJA-01",
      cashSessionId: "sess-uuid-101-202",
      cashierName: "Carlos Cajero",
      closedAtIso: "2026-11-02T21:00:00-05:00",
      firstReceiptCode: "POS-000001",
      lastReceiptCode: "POS-000045",
      totalSalesCount: 45,
      expectedCashCents: 1_250_000_00,
      declaredCashCents: 1_250_000_00,
      differenceCents: 0,
      grossTotalCents: 2_500_000_00,
      returnsTotalCents: 50_000_00,
      netTotalCents: 2_450_000_00,
      taxBreakdown: {
        gravado19Cents: 1_000_000_00,
        iva19Cents: 190_000_00,
        gravado5Cents: 400_000_00,
        iva5Cents: 20_000_00,
        exentoCents: 600_000_00,
        excluidoCents: 240_000_00,
        inc8Cents: 0
      },
      paperWidthMm: 80
    });

    expect(slip80).toContain("CIERRE FISCAL DIARIO - REPORTE Z");
    expect(slip80).toContain("(Art. 616 del E.T.)");
    expect(slip80).toContain("Supertienda El Éxito");
    expect(slip80).toContain("NIT: 900.123.456-7");
    expect(slip80).toContain("POS-000001");
    expect(slip80).toContain("POS-000045");
    expect(slip80).toContain("Gravado 19%:");
    expect(slip80).toContain("ARQUEO DE EFECTIVO");

    // En 58 mm (32 columnas)
    const slip58 = printer.renderReportZSlipText({
      businessName: "Tienda Don Juan",
      nit: "800.999.111-2",
      terminalCode: "CAJA-02",
      cashSessionId: "sess-58mm",
      cashierName: "Pedro",
      closedAtIso: "2026-11-02T21:00:00-05:00",
      firstReceiptCode: "POS-001",
      lastReceiptCode: "POS-010",
      totalSalesCount: 10,
      expectedCashCents: 100_000_00,
      declaredCashCents: 100_000_00,
      differenceCents: 0,
      grossTotalCents: 100_000_00,
      returnsTotalCents: 0,
      netTotalCents: 100_000_00,
      paperWidthMm: 58
    });
    expect(slip58).toContain("CIERRE FISCAL DIARIO - REPORTE Z");
    expect(slip58.split("\n")[0]?.length).toBe(32);
  });
});

