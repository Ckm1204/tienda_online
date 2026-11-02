import { describe, it, expect } from "vitest";
import { validateBarcode } from "@tiendita/contracts";
import { TenantService } from "@tiendita/tenant-service";
import { IdentityService, hashSecretArgon2idUniqueSalt } from "@tiendita/identity-service";
import { DeviceService } from "@tiendita/device-service";
import { CatalogService } from "../index.js";

describe("ÉPICA 08 — Microservicios de Dominio Core en Nube (tenant, identity, device, catalog)", () => {
  it("FT-08.1 (HU-072, HU-073, HU-188..HU-190, HU-264, HU-265, HU-288, HU-289, HU-331, HU-361): planes, add-ons, sucursales, upgrade/downgrade, historial de estado, términos legales y exportación", () => {
    const tenantSvc = new TenantService();
    const t0 = 1_760_000_000_000;

    const { tenantId, mainBranch, entitlements } = tenantSvc.createTenant({
      businessName: "Tienda El Sol",
      nit: "900123456-8",
      planCode: "NEGOCIO",
      actorId: "super-1",
      nowMs: t0
    });
    expect(entitlements.max_terminals).toBe(2);
    expect(entitlements.max_users).toBe(7);

    // HU-072 & HU-265: Contratar 1 EXTRA_TERMINAL y 1 EXTRA_USERS_5 -> max_terminals=3, max_users=12
    tenantSvc.setAddonQuantity(tenantId, "EXTRA_TERMINAL", 1);
    const updatedEnt = tenantSvc.setAddonQuantity(tenantId, "EXTRA_USERS_5", 1);
    expect(updatedEnt.max_terminals).toBe(3);
    expect(updatedEnt.max_users).toBe(12);

    // HU-073: Bloqueo al crear segunda sucursal en plan NEGOCIO (max_branches = 1)
    expect(() =>
      tenantSvc.createBranch({
        tenantId,
        code: "SUC2",
        name: "Sede Norte",
        address: "Calle 80"
      })
    ).toThrow("403 PLAN_LIMIT_REACHED:max_branches");

    // HU-264: Editar pie de página de comprobante de sucursal
    const patchedBranch = tenantSvc.updateBranch(tenantId, mainBranch.id, {
      receipt_footer: "¡Domicilios al 310 555 1234!"
    });
    expect(patchedBranch.receipt_footer).toBe("¡Domicilios al 310 555 1234!");

    // HU-189: Downgrade de NEGOCIO a TENDERO teniendo 2 cajas activas exige elegir cuál caja retirar
    tenantSvc.setAddonQuantity(tenantId, "EXTRA_TERMINAL", 0);
    expect(() =>
      tenantSvc.changePlan({
        tenantId,
        targetPlan: "TENDERO",
        currentActiveTerminalsCount: 2
      })
    ).toThrow("DOWNGRADE_REQUIRES_SELECTING_TERMINALS_TO_RETIRE:1");

    const scheduledDown = tenantSvc.changePlan({
      tenantId,
      targetPlan: "TENDERO",
      currentActiveTerminalsCount: 2,
      terminalsToRetireAtPeriodEnd: ["term-2"]
    });
    expect(scheduledDown.mode).toBe("SCHEDULED_DOWNGRADE");

    // HU-289: Cambio de estado registra en tenant_status_history
    tenantSvc.changeTenantStatus({
      tenantId,
      toStatus: "PAST_DUE",
      reason: "DUNNING",
      actorId: "system-dunning",
      nowMs: t0 + 1000
    });
    expect(tenantSvc.statusHistory.at(-1)?.to_status).toBe("PAST_DUE");

    // HU-361 & HU-190: Aceptación legal y exportación completa de datos
    const legal = tenantSvc.recordLegalAcceptance({
      tenantId,
      userId: "owner-1",
      tosAccepted: true,
      privacyAccepted: true,
      dpaAccepted: true,
      notObligatedDeclared: true,
      ipAddress: "181.50.10.20"
    });
    expect(legal.tos_version).toBe("2026.1");
    expect(tenantSvc.requestFullTenantExport(tenantId, t0 + 2000).downloadUrl).toContain(tenantId);
  });

  it("FT-08.2 (HU-074..HU-076, HU-266..HU-269, HU-292..HU-294, HU-388, HU-456, HU-457, HU-476..HU-478, HU-500): bootstrap superadmin único, activación de dueño + códigos MFA, Argon2id con sal única, límites de usuarios/roles, reuso de refresh token y soporte JIT solo lectura", () => {
    const idSvc = new IdentityService();
    const t0 = 1_760_000_000_000;

    // HU-500: Bootstrap inicial del primer SUPER_ADMIN; segundo intento aborta
    const boot = idSvc.bootstrapSuperAdmin("fundador@tiendita.co", t0);
    expect(boot.activationToken.length).toBeGreaterThan(10);
    expect(() => idSvc.bootstrapSuperAdmin("otro@tiendita.co", t0)).toThrow(
      "SUPER_ADMIN_ALREADY_INITIALIZED"
    );

    // HU-292: Dos llamadas con el mismo PIN producen hashes Argon2id distintos por sal aleatoria única
    const h1 = hashSecretArgon2idUniqueSalt("5839");
    const h2 = hashSecretArgon2idUniqueSalt("5839");
    expect(h1).not.toBe(h2);

    // HU-074, HU-388 & HU-457: Invitación y activación de dueño con 8 códigos de respaldo MFA
    const tenantId = "tenant-sol";
    idSvc.applyTenantEntitlementsChanged({
      tenant_id: tenantId,
      max_users: 2, // Plan Tendero: Dueño + 1 Cajero
      allowed_roles: ["OWNER", "CASHIER"],
      features: { custom_roles: false }
    });

    const inv = idSvc.createOwnerInvitation({
      tenantId,
      fullName: "Don Pedro",
      email: "pedro@elsol.co",
      nowMs: t0
    });

    const act = idSvc.activateOwnerAccount({
      token: inv.activationToken,
      newPassword: "PasswordFuerte#2026",
      mfaTotpVerified: true,
      cashierPin: "4829",
      notObligatedToInvoiceDeclared: true,
      nowMs: t0 + 1000
    });
    expect(act.user.status).toBe("ACTIVE");
    expect(act.backupRecoveryCodes).toHaveLength(8);
    expect(idSvc.consumeMfaBackupRecoveryCode(act.user.id, act.backupRecoveryCodes[0]!)).toBe(true);
    expect(idSvc.consumeMfaBackupRecoveryCode(act.user.id, act.backupRecoveryCodes[0]!)).toBe(false);

    // HU-075: Rechaza rol SUPERVISOR en plan Tendero, rechaza PIN débil "1234", permite 1 CASHIER y rechaza el 3er usuario
    expect(() =>
      idSvc.createStoreUser({
        tenantId,
        fullName: "Sup",
        roleCode: "SUPERVISOR",
        pin: "5829"
      })
    ).toThrow("403 ROLE_NOT_ALLOWED_IN_PLAN:SUPERVISOR");

    expect(() =>
      idSvc.createStoreUser({
        tenantId,
        fullName: "Cajero Débil",
        roleCode: "CASHIER",
        pin: "1234"
      })
    ).toThrow("400 WEAK_PIN");

    idSvc.createStoreUser({
      tenantId,
      fullName: "Cajero 1",
      roleCode: "CASHIER",
      pin: "5829"
    });

    expect(() =>
      idSvc.createStoreUser({
        tenantId,
        fullName: "Cajero Extra",
        roleCode: "CASHIER",
        pin: "7391"
      })
    ).toThrow("403 PLAN_LIMIT_REACHED:max_users");

    // HU-266 & HU-477: Rotación de Refresh Token y revocación total al detectar reuso de RT1
    const s1 = idSvc.startWebSession({
      userId: act.user.id,
      deviceLabel: "Chrome Android",
      ipAddress: "190.10.20.30",
      passwordOk: true
    });
    expect(s1.newDeviceAlertEmitted).toBe(true);

    const rot = idSvc.rotateRefreshToken(s1.sessionId, s1.refreshToken);
    expect(rot.newRefreshToken).not.toBe(s1.refreshToken);

    // Reusar s1.refreshToken revoca toda la familia de sesiones
    expect(() => idSvc.rotateRefreshToken(s1.sessionId, s1.refreshToken)).toThrow(
      "401 REFRESH_TOKEN_REUSE_DETECTED_ALL_SESSIONS_REVOKED"
    );

    // HU-294: Sesión temporal de soporte JIT rechaza POST/PATCH con 403 READ_ONLY_SUPPORT_SESSION
    const jit = idSvc.issueSupportJitSession({
      tenantId,
      approvedByOwnerId: act.user.id,
      supportAgentId: "sup-agent-1",
      nowMs: t0
    });
    expect(() => idSvc.assertSupportJitAllowed(jit, "POST", t0 + 1000)).toThrow(
      "403 READ_ONLY_SUPPORT_SESSION"
    );
  });

  it("FT-08.3 (HU-077, HU-078, HU-270..HU-272, HU-295, HU-296, HU-333): creación de cajas, invalidación de código previo, enrolamiento atómico concurrente, firma KMS acotada por paid_until+15d y licencias de Edición Local 3/5", () => {
    const devSvc = new DeviceService();
    const tenantId = "tenant-1";
    const t0 = 1_760_000_000_000;
    devSvc.tenantMaxTerminals.set(tenantId, 2);
    devSvc.tenantLicenseMeta.set(tenantId, {
      plan_code: "NEGOCIO",
      status: "ACTIVE",
      features: { credit: true },
      paid_until_ms: t0 - 13 * 86_400_000, // Faltan solo 2 días para llegar a paid_until + 15d
      offline_grace_days: 10
    });

    const term = devSvc.createTerminal({
      tenantId,
      branchId: "b1",
      warehouseId: "w1",
      code: "CAJA-01",
      receiptPrefix: "C01",
      nowMs: t0
    });

    // HU-270: Generar un segundo código invalida el primero inmediatamente
    const code1 = devSvc.generateEnrollmentCode(term.id, t0);
    const code2 = devSvc.generateEnrollmentCode(term.id, t0 + 100);
    expect(() =>
      devSvc.enrollDeviceAtomically({
        plainCode: code1.plainCode,
        devicePublicKeySpkiB64: "pub1",
        deviceFingerprint: "fp1",
        nowMs: t0 + 200
      })
    ).toThrow("404 ENROLLMENT_CODE_INVALID");

    // HU-271: Enrolamiento atómico con code2 gana; segundo intento simultáneo recibe 409 ENROLLMENT_CODE_ALREADY_USED
    const enrolled = devSvc.enrollDeviceAtomically({
      plainCode: code2.plainCode,
      devicePublicKeySpkiB64: "pub1",
      deviceFingerprint: "fp1",
      nowMs: t0 + 200
    });
    expect(enrolled.terminal.status).toBe("ACTIVE");
    expect(() =>
      devSvc.enrollDeviceAtomically({
        plainCode: code2.plainCode,
        devicePublicKeySpkiB64: "pub2",
        deviceFingerprint: "fp2",
        nowMs: t0 + 200
      })
    ).toThrow("409 ENROLLMENT_CODE_ALREADY_USED");

    // HU-272: Terminal revocada no puede emitir nuevas licencias
    devSvc.revokeTerminal(term.id, "Equipo reemplazado");
    expect(() => devSvc.issueSignedSaasLicenseToken(term.id, t0 + 300)).toThrow(
      "403 TERMINAL_REVOKED"
    );

    // Edición Local (HU-119..HU-121, HU-124): Activación única y regla 3 de 5 componentes
    const localSerial = devSvc.issueLocalEditionSerialKey({
      customerName: "Don Jorge",
      customerNitOrCc: "79123456",
      customerPhone: "3105559999"
    });
    const hwOrig: [string, string, string, string, string] = ["CPU1", "MB1", "DISK1", "GUID1", "MAC1"];
    const actLocal = devSvc.activateLocalEditionSerial({
      serialKey: localSerial.serial_key,
      fingerprintComponents: hwOrig,
      devicePublicKeySpkiB64: "pub-local",
      nowMs: t0
    });
    expect(actLocal.payload["license_type"]).toBe("LOCAL_PERPETUAL");

    // Segundo PC intentando usar el mismo serial recibe 409 LICENSE_ALREADY_ACTIVATED_ON_ANOTHER_DEVICE
    expect(() =>
      devSvc.activateLocalEditionSerial({
        serialKey: localSerial.serial_key,
        fingerprintComponents: ["CPU2", "MB2", "DISK2", "GUID2", "MAC2"],
        devicePublicKeySpkiB64: "pub-2"
      })
    ).toThrow("409 LICENSE_ALREADY_ACTIVATED_ON_ANOTHER_DEVICE");

    // Cambiar disco y MAC (quedan 3 de 5 iguales) sigue siendo válido
    expect(
      DeviceService.verifyHardwareFingerprint3Of5(hwOrig, ["CPU1", "MB1", "NEW_DISK", "GUID1", "NEW_MAC"]).valid
    ).toBe(true);
    // Cambiar 3 componentes (solo 2 de 5 iguales) se bloquea
    expect(
      DeviceService.verifyHardwareFingerprint3Of5(hwOrig, ["CPU1", "MB1", "X3", "X4", "X5"]).valid
    ).toBe(false);
  });

  it("FT-08.4 (HU-079..HU-083, HU-273..HU-276, HU-297..HU-299, HU-389..HU-397): producto __GENERIC__ protegido, concurrencia optimista If-Match (428/409), códigos únicos, EAN-13 interno prefijo 29, precios programados, importación Excel, bandeja de genéricos y promo 3x2", () => {
    const cat = new CatalogService();
    const tenantId = "tenant-cat";
    const genericSys = cat.initializeTenantCatalog(tenantId, 3000, true);

    // HU-297: El producto reservado __GENERIC__ no se puede borrar
    expect(() => cat.softDeleteProduct(tenantId, genericSys.id)).toThrow(
      "400 SYSTEM_PRODUCT_CANNOT_BE_DELETED"
    );

    // HU-079, HU-391 & HU-392: Creación de producto con códigos de barra y control optimista If-Match
    const p1 = cat.createProduct({
      tenantId,
      sku: "YOG01",
      name: "Yogur Vaso",
      basePriceCents: 200_000,
      barcodes: [{ barcode: "7702004003508", pack_qty_milli: 1000 }]
    });

    // Rechazar código de barras duplicado dentro del mismo tenant
    expect(() =>
      cat.createProduct({
        tenantId,
        sku: "OTRO",
        name: "Otro",
        basePriceCents: 100_000,
        barcodes: [{ barcode: "7702004003508" }]
      })
    ).toThrow("409 BARCODE_ALREADY_EXISTS:7702004003508");

    // Sin If-Match -> 428 PRECONDITION_REQUIRED; con versión vieja -> 409 VERSION_CONFLICT
    expect(() =>
      cat.updateProductOptimistic({
        tenantId,
        productId: p1.id,
        ifMatchVersion: null,
        patch: { base_price_cents: 220_000 }
      })
    ).toThrow("428 PRECONDITION_REQUIRED");

    cat.updateProductOptimistic({
      tenantId,
      productId: p1.id,
      ifMatchVersion: 1,
      patch: { base_price_cents: 210_000 }
    });

    expect(() =>
      cat.updateProductOptimistic({
        tenantId,
        productId: p1.id,
        ifMatchVersion: 1,
        patch: { base_price_cents: 230_000 }
      })
    ).toThrow("409 VERSION_CONFLICT:current=2");

    // HU-276: Generación de EAN-13 interno con prefijo 29 y dígito GS1 válido
    const internalEan = cat.generateInternalEan13Barcode();
    expect(internalEan.startsWith("29")).toBe(true);
    expect(validateBarcode(internalEan).valid).toBe(true);

    // HU-080 & HU-396: Precio programado futuro se activa exactamente en valid_from_ms
    const tomorrow6am = 1_760_100_000_000;
    cat.scheduleBranchPrice({
      tenantId,
      branchId: "B1",
      productId: p1.id,
      priceCents: 320_000,
      validFromMs: tomorrow6am
    });
    expect(cat.resolveEffectiveProductPriceCents(p1.id, "B1", tomorrow6am - 1000)).toBe(210_000);
    expect(cat.resolveEffectiveProductPriceCents(p1.id, "B1", tomorrow6am)).toBe(320_000);

    // HU-081 & HU-394: Previsualización de importación Excel detecta precio negativo y código duplicado
    const imp = cat.previewAndExecuteBulkImport({
      tenantId,
      rows: [
        { rowNumber: 12, sku: "A1", name: "Item 1", price_cents: 100_000, barcode: "7701111111111" },
        { rowNumber: 42, sku: "A2", name: "Item Neg", price_cents: -50_000, barcode: "7702222222222" },
        { rowNumber: 108, sku: "A3", name: "Item Dup", price_cents: 100_000, barcode: "7701111111111" }
      ]
    });
    expect(imp.validRows).toBe(1);
    expect(imp.errors.map((e) => e.rowNumber)).toEqual([42, 108]);

    // HU-082, HU-298 & HU-395: Conversión de artículo genérico vendido en producto formal
    const genPending = cat.recordGenericItemSold({
      tenantId,
      saleId: "sale-1",
      description: "Ponqué Ramo nuevo",
      unitPriceCents: 320_000,
      qtyMilli: 1000
    });
    const converted = cat.convertGenericItemToCatalogProduct({
      genericSaleId: genPending.id,
      sku: "RAMO01",
      barcode: "7702914001012"
    });
    expect(converted.name).toBe("Ponqué Ramo nuevo");
    expect(cat.genericItemSales.get(genPending.id)?.status).toBe("CREATED");

    // HU-083 & HU-397: Promoción 3x2 (NXM) aplica $2.000 de descuento al llevar 3 unidades de $2.000
    cat.createPromotion({
      tenant_id: tenantId,
      name: "Pague 2 Lleve 3 en Yogures",
      kind: "NXM",
      product_id: p1.id,
      buy_qty_milli: 3000,
      pay_qty_milli: 2000,
      priority: 10,
      active: true
    });
    const promoEval = cat.evaluateLinePromotionDiscountCents({
      tenantId,
      productId: p1.id,
      qtyMilli: 3000,
      unitPriceCents: 200_000
    });
    expect(promoEval).toEqual({
      discountCents: 200_000,
      appliedPromoName: "Pague 2 Lleve 3 en Yogures"
    });
  });
});
