import { describe, it, expect, beforeEach } from "vitest";
import { LocalEditionManager } from "../local/local-edition-manager.js";

describe("EP-13: Edición Local (Pago Único, Activación Online Única y Respaldos .tdbak)", () => {
  let mgr: LocalEditionManager;

  beforeEach(() => {
    mgr = new LocalEditionManager();
  });

  it("HU-362 & HU-120: Asistente inicial, aceptación de EULA y código de recuperación de 16 caracteres", () => {
    const eula = LocalEditionManager.getEulaText();
    expect(eula).toContain("CUSTODIA LOCAL DE DATOS");
    expect(eula).toContain(".tdbak");

    const code = LocalEditionManager.generateRecoveryCode();
    expect(code).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/);

    const last4 = code.slice(-4);

    // Falla si no acepta EULA
    expect(() =>
      mgr.initialSetup({
        businessName: "Tienda San Jorge",
        nitOrCc: "10102020",
        adminPassword: "supersecretadmin123",
        recoveryCode: code,
        confirmedLast4: last4,
        eulaAccepted: false
      })
    ).toThrow("EULA_MUST_BE_ACCEPTED");

    // Falla si los últimos 4 caracteres no coinciden
    expect(() =>
      mgr.initialSetup({
        businessName: "Tienda San Jorge",
        nitOrCc: "10102020",
        adminPassword: "supersecretadmin123",
        recoveryCode: code,
        confirmedLast4: "XXXX",
        eulaAccepted: true
      })
    ).toThrow("RECOVERY_CODE_CONFIRMATION_MISMATCH");

    // Configuración exitosa
    const setup = mgr.initialSetup({
      businessName: "Tienda San Jorge",
      nitOrCc: "10102020",
      adminPassword: "supersecretadmin123",
      recoveryCode: code,
      confirmedLast4: last4,
      eulaAccepted: true
    });

    expect(setup.admin.business_name).toBe("Tienda San Jorge");
    expect(setup.admin.password_hash).not.toBe("supersecretadmin123");
    expect(setup.admin.recovery_code_hash).toBeDefined();
  });

  it("HU-119 & HU-309: Inicio dual (Cajero con PIN vs Administrador con contraseña y bloqueo a los 5 intentos)", () => {
    const code = LocalEditionManager.generateRecoveryCode();
    mgr.initialSetup({
      businessName: "Super Fruver",
      nitOrCc: "900123456",
      adminPassword: "adminPassword456",
      recoveryCode: code,
      confirmedLast4: code.slice(-4),
      eulaAccepted: true
    });

    const cashier = mgr.addCashier("Pedro Cajero", "1234");
    expect(cashier.name).toBe("Pedro Cajero");

    // Login cajero exitoso
    const cashierLogin = mgr.loginCashier(cashier.id, "1234");
    expect(cashierLogin.view).toBe("POS_CAJA");

    // Login cajero con PIN incorrecto
    expect(() => mgr.loginCashier(cashier.id, "9999")).toThrow("401 INVALID_PIN");

    // Login admin exitoso
    const adminLogin = mgr.loginAdmin("adminPassword456");
    expect(adminLogin.view).toBe("LOCAL_ADMIN");

    // 5 intentos fallidos bloquean la cuenta de administrador
    for (let i = 0; i < 4; i++) {
      expect(() => mgr.loginAdmin("wrongPass")).toThrow("401 INVALID_ADMIN_PASSWORD");
    }
    // El 5to fallo activa el bloqueo
    expect(() => mgr.loginAdmin("wrongPass")).toThrow("401 INVALID_ADMIN_PASSWORD");

    // 6to intento es rechazado inmediatamente por estar bloqueado (423)
    expect(() => mgr.loginAdmin("adminPassword456")).toThrow("423 ADMIN_LOCKED");
  });

  it("HU-124 & HU-311: Límites según edición (LOCAL_ESENCIAL máx 2 cajeros y 50 fiados)", () => {
    mgr.licenseInfo = {
      license_id: "LOC-2026-0001",
      edition: "LOCAL_ESENCIAL",
      business_name: "Tiendita Esencial",
      owner_doc: "11223344",
      receipt_prefix: "L01",
      updates_until_ms: Date.now() + 365 * 86_400_000
    };

    mgr.addCashier("Cajero 1", "1111");
    mgr.addCashier("Cajero 2", "2222");

    // Tercer cajero rechazado en LOCAL_ESENCIAL
    expect(() => mgr.addCashier("Cajero 3", "3333")).toThrow("EDITION_LIMIT_REACHED");

    // Hasta 50 clientes con fiado permitidos
    for (let i = 0; i < 50; i++) {
      mgr.addCustomer({
        name: `Cliente ${i}`,
        docNumber: `CC-${i}`,
        phone: "3000000000",
        creditLimitCents: 100_000
      });
    }

    // Cliente 51 con fiado rechazado en LOCAL_ESENCIAL
    expect(() =>
      mgr.addCustomer({
        name: "Cliente 51",
        docNumber: "CC-51",
        phone: "3000000000",
        creditLimitCents: 50_000
      })
    ).toThrow("EDITION_LIMIT_REACHED");
  });

  it("HU-312: Consultas SQL locales de reportes (Ventas, margen, por medio de pago y cartera)", () => {
    const code = LocalEditionManager.generateRecoveryCode();
    mgr.initialSetup({
      businessName: "Abarrotes El Paisa",
      nitOrCc: "800555666",
      adminPassword: "paisaPassword789",
      recoveryCode: code,
      confirmedLast4: code.slice(-4),
      eulaAccepted: true
    });

    mgr.licenseInfo = {
      license_id: "LOC-2026-0002",
      edition: "LOCAL_PLUS",
      business_name: "Abarrotes El Paisa",
      owner_doc: "800555666",
      receipt_prefix: "L01",
      updates_until_ms: Date.now() + 365 * 86_400_000
    };

    const p1 = mgr.upsertProduct({
      barcode: "7701234567890",
      name: "Arroz Diana 1kg",
      category: "Granos",
      cost_cents: 3_800_00,
      price_cents: 4_800_00,
      stock_milli: 50_000
    });

    const cust = mgr.addCustomer({
      name: "Vecino Carlos",
      docNumber: "79123456",
      phone: "3112223344",
      creditLimitCents: 200_000_00
    });

    const cashier = mgr.addCashier("María", "5555");
    mgr.openShift(cashier.id, 50_000_00);

    // Venta en efectivo
    mgr.registerSale({
      total_cents: 9_600_00,
      subtotal_cents: 9_600_00,
      tax_cents: 0,
      discount_cents: 0,
      payment_method: "CASH",
      created_at_ms: Date.now(),
      lines: [{ product_id: p1.id, qty_milli: 2_000, unit_price_cents: 4_800_00, cost_cents: 3_800_00 }]
    });

    // Venta a crédito (fiado)
    mgr.registerSale({
      total_cents: 4_800_00,
      subtotal_cents: 4_800_00,
      tax_cents: 0,
      discount_cents: 0,
      payment_method: "CREDIT",
      created_at_ms: Date.now(),
      lines: [{ product_id: p1.id, qty_milli: 1_000, unit_price_cents: 4_800_00, cost_cents: 3_800_00 }]
    });

    const report = mgr.getLocalReportSummary();
    expect(report.sales_count).toBe(2);
    expect(report.total_sales_cents).toBe(14_400_00);
    expect(report.total_cost_cents).toBe(11_400_00);
    expect(report.gross_margin_cents).toBe(3_000_00);
    expect(report.gross_margin_percent).toBe(20.83);
    expect(report.by_payment_method.CASH).toBe(9_600_00);
    expect(report.by_payment_method.CREDIT).toBe(4_800_00);
    expect(report.total_credit_receivable_cents).toBe(4_800_00);
    expect(p1.stock_milli).toBe(47_000); // 50.000 - 3.000
  });

  it("HU-125, HU-127 & HU-313: Respaldo .tdbak cifrado con verificación y restauración", () => {
    const code = LocalEditionManager.generateRecoveryCode();
    mgr.initialSetup({
      businessName: "Droguería La Rebaja Local",
      nitOrCc: "901333444",
      adminPassword: "drogueriaPass123",
      recoveryCode: code,
      confirmedLast4: code.slice(-4),
      eulaAccepted: true
    });

    mgr.licenseInfo = {
      license_id: "LOC-2026-9999",
      edition: "LOCAL_PLUS",
      business_name: "Droguería La Rebaja Local",
      owner_doc: "901333444",
      receipt_prefix: "D01",
      updates_until_ms: Date.now() + 365 * 86_400_000
    };

    mgr.upsertProduct({
      barcode: "7709990001",
      name: "Dolex Forte",
      category: "Medicamentos",
      cost_cents: 12_000_00,
      price_cents: 18_000_00,
      stock_milli: 100_000
    });

    // Generar respaldo .tdbak
    const backup = mgr.generateTdbak({ recoveryCode: code, kind: "MANUAL" });
    expect(backup.manifest.counts.products_count).toBe(1);
    expect(backup.manifest.sha256_checksum).toHaveLength(64);

    // Crear nueva instancia y restaurar
    const newMgr = new LocalEditionManager();
    const restoreRes = newMgr.restoreTdbak({
      packageHex: backup.encryptedPayloadHex,
      recoveryCode: code,
      targetLicenseId: "LOC-2026-9999"
    });

    expect(restoreRes.restoredCounts.products_count).toBe(1);
    expect(newMgr.adminAccount?.business_name).toBe("Droguería La Rebaja Local");
    expect(newMgr.products.size).toBe(1);

    // Intento de restaurar con licencia equivocada es bloqueado
    expect(() =>
      newMgr.restoreTdbak({
        packageHex: backup.encryptedPayloadHex,
        recoveryCode: code,
        targetLicenseId: "LOC-DIFFERENT-LICENSE"
      })
    ).toThrow("403 LICENSE_MISMATCH");
  });

  it("HU-126 & HU-314: Solicitud de cambio de equipo bloquea ventas en el PC de origen", () => {
    const code = LocalEditionManager.generateRecoveryCode();
    mgr.initialSetup({
      businessName: "Panadería La Espiga",
      nitOrCc: "700800900",
      adminPassword: "panaderiaPassword1",
      recoveryCode: code,
      confirmedLast4: code.slice(-4),
      eulaAccepted: true
    });

    const c = mgr.addCashier("Carlos", "1111");
    mgr.openShift(c.id, 20_000_00);

    // No se puede iniciar traslado con turno abierto
    expect(() => mgr.initiateDeviceTransfer(code)).toThrow("MUST_CLOSE_SHIFT_BEFORE_TRANSFER");

    mgr.closeShift(20_000_00);

    // Iniciar traslado
    const transfer = mgr.initiateDeviceTransfer(code);
    expect(transfer.finalBackup).toBeDefined();
    expect(transfer.transferHash).toHaveLength(64);
    expect(mgr.deviceTransferState).toBe("PENDING_RELEASE");

    // Intento de abrir turno o vender es bloqueado en PENDING_RELEASE
    expect(() => mgr.openShift(c.id, 10_000_00)).toThrow("403 DEVICE_NOT_OPERATIONAL");

    // Completar traslado a TRANSFERRED
    mgr.completeDeviceTransfer();
    expect(mgr.deviceTransferState).toBe("TRANSFERRED");
    expect(() =>
      mgr.registerSale({
        total_cents: 5_000_00,
        subtotal_cents: 5_000_00,
        tax_cents: 0,
        discount_cents: 0,
        payment_method: "CASH",
        created_at_ms: Date.now(),
        lines: []
      })
    ).toThrow("403 DEVICE_TRANSFERRED");
  });

  it("HU-128, HU-315 & HU-468: Validación de actualizaciones, exportación a la nube y bloqueo de sync", () => {
    mgr.licenseInfo = {
      license_id: "LOC-2026-4444",
      edition: "LOCAL_PLUS",
      business_name: "Cigarrería Central",
      owner_doc: "50607080",
      receipt_prefix: "C01",
      updates_until_ms: new Date("2027-10-01").getTime()
    };

    // Validación de fecha de compilación del instalador (HU-128)
    const validBuild = mgr.validateInstallerBuild(new Date("2027-05-01").getTime());
    expect(validBuild.canInstall).toBe(true);

    const expiredBuild = mgr.validateInstallerBuild(new Date("2028-01-01").getTime());
    expect(expiredBuild.canInstall).toBe(false);
    expect(expiredBuild.reason).toContain("Tu licencia incluye actualizaciones hasta");

    // Exportación hacia la nube (HU-315)
    mgr.upsertProduct({
      barcode: "770111222333",
      name: "Chicles Trident",
      category: "Confitería",
      cost_cents: 1_000_00,
      price_cents: 1_500_00,
      stock_milli: 10_000
    });

    const cloudPkg = mgr.exportToCloudPackage();
    expect(cloudPkg.version).toBe("1.0");
    expect(cloudPkg.products.length).toBe(1);
    expect(cloudPkg.counts.products).toBe(1);

    // HU-468: No endpoints de sync permitidos en la Edición Local
    expect(mgr.isEndpointAllowed("/v1/sync/push")).toBe(false);
    expect(mgr.isEndpointAllowed("/v1/terminals/heartbeat")).toBe(false);
    expect(mgr.isEndpointAllowed("/v1/local-activation/activate")).toBe(true);
  });
});
