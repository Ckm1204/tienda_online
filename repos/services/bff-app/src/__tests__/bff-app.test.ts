import { describe, it, expect, beforeEach } from "vitest";
import { newId } from "@tiendita/contracts";
import { BffApp, type HttpRequest } from "../index.js";

describe("ÉPICA 10 — bff-app: Gateway, Seguridad, Agregador y Administración (FT-10.1, FT-10.2, FT-10.3)", () => {
  let bff: BffApp;
  let tenantId: string;
  let ownerId: string;
  let t0: number;

  beforeEach(() => {
    bff = new BffApp();
    t0 = 1_760_000_000_000;

    // Crear tienda y dueño
    const res = bff.tenantService.createTenant({
      businessName: "Supertienda El Éxito",
      nit: "900987654-1",
      planCode: "NEGOCIO",
      actorId: "super-admin-01",
      nowMs: t0
    });
    tenantId = res.tenantId;

    // Configurar límites en identity y crear usuario dueño
    bff.identityService.applyTenantEntitlementsChanged({
      tenant_id: tenantId,
      max_users: 7,
      allowed_roles: ["OWNER", "SUPERVISOR", "CASHIER", "ACCOUNTANT"],
      features: { credit: true, promotions: true }
    });

    const owner = bff.identityService.createStoreUser({
      tenantId,
      fullName: "Don Alberto Dueño",
      email: "alberto@tienda.co",
      roleCode: "OWNER",
      pin: "8520",
      nowMs: t0
    });
    ownerId = owner.id;
    owner.status = "ACTIVE";
    owner.mfa_enabled = true;
  });

  it("HU-181: API Gateway rechaza payloads excesivos con 413, valida audiencia JWT y aplica CORS", async () => {
    // 1. Rechazo de payload > 1 MB en /v1/sync/push
    const pushReq: HttpRequest = {
      method: "POST",
      path: "/v1/sync/push",
      ip: "190.14.20.1",
      headers: {},
      rawBodySizeBytes: 1_200_000 // 1.2 MB
    };
    const pushRes = await bff.handleRequest(pushReq, t0);
    expect(pushRes.status).toBe(413);
    expect((pushRes.body as any).error).toBe("Payload Too Large");

    // 2. CORS para origen permitido
    const corsReq: HttpRequest = {
      method: "OPTIONS",
      path: "/v1/app/bootstrap",
      ip: "190.14.20.1",
      origin: "https://app.tienditaonline.co",
      headers: {}
    };
    const corsRes = await bff.handleRequest(corsReq, t0);
    expect(corsRes.status).toBe(204);
    expect(corsRes.headers["Access-Control-Allow-Origin"]).toBe("https://app.tienditaonline.co");

    // 3. Rechazo de JWT con audiencia inválida (ej. token de pos-device tratando de acceder a bff-app)
    const badAudReq: HttpRequest = {
      method: "GET",
      path: "/v1/app/bootstrap",
      ip: "190.14.20.1",
      headers: {},
      claims: {
        sub: ownerId,
        tid: tenantId,
        roles: ["OWNER"],
        perms: ["catalog.read"],
        aud: "pos-device" // No es "mgmt-app" ni "platform"
      }
    };
    const badAudRes = await bff.handleRequest(badAudReq, t0);
    expect(badAudRes.status).toBe(403);
    expect((badAudRes.body as any).error).toBe("FORBIDDEN_AUDIENCE");
  });

  it("HU-182: Rate Limiting distribuido bloquea IP anónima tras 10 intentos con 429 y Retry-After", async () => {
    const ip = "186.84.10.99";
    for (let i = 1; i <= 10; i++) {
      const res = await bff.handleRequest({
        method: "POST",
        path: "/v1/auth/login",
        ip,
        headers: {},
        body: { email: "wrong@test.co", password: "pwd" }
      }, t0);
      expect(res.status).toBe(401);
    }

    // Intento 11 debe devolver 429
    const blockedRes = await bff.handleRequest({
      method: "POST",
      path: "/v1/auth/login",
      ip,
      headers: {},
      body: { email: "wrong@test.co", password: "pwd" }
    }, t0 + 1000);

    expect(blockedRes.status).toBe(429);
    expect(blockedRes.headers["Retry-After"]).toBeDefined();
    expect((blockedRes.body as any).error).toBe("Too Many Requests");
  });

  it("HU-183: Middleware de Idempotencia HTTP (Idempotency-Key) evita duplicados en reintentos", async () => {
    const claims = {
      sub: ownerId,
      tid: tenantId,
      roles: ["OWNER"],
      perms: ["catalog.read", "catalog.manage"],
      aud: "mgmt-app" as const
    };

    const idempotencyKey = "key-create-product-001";
    const createReq: HttpRequest = {
      method: "POST",
      path: "/v1/app/products",
      ip: "190.14.20.1",
      headers: { "Idempotency-Key": idempotencyKey },
      claims,
      body: {
        sku: "PAN-001",
        name: "Pan Tajado Bimbo",
        basePriceCents: 4_500_000,
        costCents: 3_500_000,
        barcode: "7702001001002"
      }
    };

    // Primera llamada -> Crea el producto
    const res1 = await bff.handleRequest(createReq, t0);
    expect(res1.status).toBe(201);
    const createdId = (res1.body as any).id;
    expect(createdId).toBeDefined();

    // Reintento con la misma clave (simulando desconexión de red) -> Devuelve respuesta cacheada
    const res2 = await bff.handleRequest(createReq, t0 + 2000);
    expect(res2.status).toBe(201);
    expect((res2.body as any).id).toBe(createdId);
    expect(res2.headers["X-Cache-Lookup"]).toBe("HIT_IDEMPOTENCY");

    // Verificar que solo se creó un producto en el catálogo
    const allProducts = [...bff.catalogService.products.values()].filter((p) => p.tenant_id === tenantId);
    expect(allProducts).toHaveLength(1);
  });

  it("HU-316: GET /v1/app/bootstrap retorna contexto unificado (usuario, permisos, tienda, plan y sucursales)", async () => {
    const claims = {
      sub: ownerId,
      tid: tenantId,
      roles: ["OWNER"],
      perms: ["catalog.read", "terminal.read"],
      aud: "mgmt-app" as const
    };

    const bootstrapRes = await bff.handleRequest({
      method: "GET",
      path: "/v1/app/bootstrap",
      ip: "190.14.20.1",
      headers: {},
      claims
    }, t0);

    expect(bootstrapRes.status).toBe(200);
    const body = bootstrapRes.body as any;
    expect(body.user.full_name).toBe("Don Alberto Dueño");
    expect(body.tenant.business_name).toBe("Supertienda El Éxito");
    expect(body.tenant.plan_code).toBe("NEGOCIO");
    expect(body.entitlements.max_terminals).toBe(2);
    expect(body.branches).toHaveLength(1);
    expect(body.branches[0].name).toBe("Sede Principal");
  });

  it("HU-317 & HU-318: Degradación parcial ante fallas secundarias y caché corta de reportes con invalidación", async () => {
    const claims = {
      sub: ownerId,
      tid: tenantId,
      roles: ["OWNER"],
      perms: ["reports.read"],
      aud: "mgmt-app" as const
    };

    // 1. Simular circuito abierto en audit-service
    const auditBreaker = bff.getBreaker("audit-service");
    // Forzar fallo abriendo el circuito
    for (let i = 0; i < 5; i++) {
      try {
        await auditBreaker.execute(async () => {
          throw new Error("Audit service down");
        }, { nowMs: t0 });
      } catch {}
    }
    expect(auditBreaker.getState(t0)).toBe("OPEN");

    // 2. Consulta al dashboard: carga normalmente con widget de auditoría degradado
    const dashRes1 = await bff.handleRequest({
      method: "GET",
      path: "/v1/app/reports/dashboard",
      ip: "190.14.20.1",
      headers: {},
      claims
    }, t0);

    expect(dashRes1.status).toBe(200);
    const body1 = dashRes1.body as any;
    expect(body1.audit_widget.degraded).toBe(true);
    expect(body1.audit_widget.message).toContain("En actualización");

    // 3. Segunda llamada dentro de 30s se sirve desde caché
    const dashRes2 = await bff.handleRequest({
      method: "GET",
      path: "/v1/app/reports/dashboard",
      ip: "190.14.20.1",
      headers: {},
      claims
    }, t0 + 10_000);
    expect(dashRes2.headers["X-Cache-Lookup"]).toBe("HIT_REPORT_CACHE");

    // 4. Se registra una venta -> la caché del tenant se invalida
    await bff.handleRequest({
      method: "POST",
      path: "/v1/app/events/sales-recorded",
      ip: "190.14.20.1",
      headers: {},
      claims
    }, t0 + 15_000);

    const dashRes3 = await bff.handleRequest({
      method: "GET",
      path: "/v1/app/reports/dashboard",
      ip: "190.14.20.1",
      headers: {},
      claims
    }, t0 + 16_000);
    expect(dashRes3.headers["X-Cache-Lookup"]).toBeUndefined();
  });

  it("HU-319: Interceptor registra admin_action en audit-service tras mutaciones exitosas", async () => {
    const claims = {
      sub: ownerId,
      tid: tenantId,
      roles: ["OWNER"],
      perms: ["catalog.read", "catalog.manage"],
      aud: "mgmt-app" as const
    };

    const res = await bff.handleRequest({
      method: "POST",
      path: "/v1/app/products",
      ip: "190.14.20.1",
      headers: {},
      claims,
      body: {
        sku: "LECH-001",
        name: "Leche Alquería 1.1L",
        basePriceCents: 4_200_000,
        costCents: 3_200_000,
        barcode: "7702002002008"
      }
    }, t0);

    expect(res.status).toBe(201);
    const auditEntries = bff.auditService.entriesByTenant.get(tenantId);
    expect(auditEntries).toBeDefined();
    expect(auditEntries!.length).toBeGreaterThan(0);
    expect(auditEntries?.[0]?.action).toBe("admin_action.post._v1_app_products");
    expect(auditEntries?.[0]?.actor_id).toBe(ownerId);
  });

  it("HU-097 & HU-098: Gestión de cajas, generación de QR con expiración de 15 min y revocación con Step-up MFA", async () => {
    const claimsNoMfa = {
      sub: ownerId,
      tid: tenantId,
      roles: ["OWNER"],
      perms: ["terminal.manage", "terminal.read"],
      aud: "mgmt-app" as const,
      amr: ["pwd"] // No tiene claim "mfa"
    };

    const mainBranch = [...bff.tenantService.branches.values()].find((b) => b.tenant_id === tenantId)!;

    // 1. Crear CAJA-01
    const createTermRes = await bff.handleRequest({
      method: "POST",
      path: "/v1/app/terminals",
      ip: "190.14.20.1",
      headers: {},
      claims: claimsNoMfa,
      body: {
        branchId: mainBranch.id,
        warehouseId: mainBranch.default_warehouse_id,
        code: "CAJA-01",
        receiptPrefix: "C01"
      }
    }, t0);
    expect(createTermRes.status).toBe(201);
    const termId = (createTermRes.body as any).id;

    // 2. Generar código y QR de enrolamiento
    const qrRes = await bff.handleRequest({
      method: "POST",
      path: `/v1/app/terminals/${termId}/enrollment-code`,
      ip: "190.14.20.1",
      headers: {},
      claims: claimsNoMfa
    }, t0);
    expect(qrRes.status).toBe(200);
    const qrBody = qrRes.body as any;
    expect(qrBody.code).toBeDefined();
    expect(qrBody.remainingMinutes).toBe(15);
    expect(qrBody.expiresAtMs).toBe(t0 + 15 * 60 * 1000);

    // 3. Intento de revocar caja sin Step-up MFA falla con 403 STEP_UP_MFA_REQUIRED
    const revokeFail = await bff.handleRequest({
      method: "POST",
      path: `/v1/app/terminals/${termId}/revoke`,
      ip: "190.14.20.1",
      headers: {},
      claims: claimsNoMfa
    }, t0);
    expect(revokeFail.status).toBe(403);
    expect((revokeFail.body as any).code).toBe("STEP_UP_MFA_REQUIRED");

    // 4. Revocación exitosa con token que tiene MFA reciente (< 5 minutos)
    const claimsWithRecentMfa = {
      ...claimsNoMfa,
      amr: ["pwd", "mfa"],
      mfa_authenticated_at: Math.floor(t0 / 1000) // Autenticado hace 0 segundos
    };
    const revokeOk = await bff.handleRequest({
      method: "POST",
      path: `/v1/app/terminals/${termId}/revoke`,
      ip: "190.14.20.1",
      headers: {},
      claims: claimsWithRecentMfa
    }, t0 + 60_000); // 1 minuto después
    expect(revokeOk.status).toBe(200);
    expect((revokeOk.body as any).revoked).toBe(true);

    const termRecord = bff.deviceService.terminals.get(termId);
    expect(termRecord?.status).toBe("REVOKED");
  });

  it("HU-099: Gestión de empleados (crear cajero, asignar sucursal, cambiar PIN, activar/desactivar)", async () => {
    const claims = {
      sub: ownerId,
      tid: tenantId,
      roles: ["OWNER"],
      perms: ["user.manage", "user.read"],
      aud: "mgmt-app" as const
    };

    const mainBranch = [...bff.tenantService.branches.values()].find((b) => b.tenant_id === tenantId)!;

    // 1. Crear cajero
    const createCashierRes = await bff.handleRequest({
      method: "POST",
      path: "/v1/app/users",
      ip: "190.14.20.1",
      headers: {},
      claims,
      body: {
        fullName: "Carlos Cajero",
        email: "carlos@tienda.co",
        roleCode: "CASHIER",
        branchId: mainBranch.id,
        initialPin: "4829"
      }
    }, t0);
    expect(createCashierRes.status).toBe(201);
    const cashier = createCashierRes.body as any;
    expect(cashier.full_name).toBe("Carlos Cajero");
    expect(cashier.status).toBe("ACTIVE");

    // 2. Desactivar cajero
    const patchRes = await bff.handleRequest({
      method: "PATCH",
      path: `/v1/app/users/${cashier.id}`,
      ip: "190.14.20.1",
      headers: {},
      claims,
      body: { status: "DISABLED" }
    }, t0 + 1000);
    expect(patchRes.status).toBe(200);
    expect((patchRes.body as any).user.status).toBe("DISABLED");

    // 3. Reset de PIN a nuevo PIN no trivial
    const resetRes = await bff.handleRequest({
      method: "PATCH",
      path: `/v1/app/users/${cashier.id}`,
      ip: "190.14.20.1",
      headers: {},
      claims,
      body: { resetPin: "9371" }
    }, t0 + 2000);
    expect(resetRes.status).toBe(200);
  });

  it("HU-100 & HU-421: Consulta de producto por código de barras y clonación de producto", async () => {
    const claims = {
      sub: ownerId,
      tid: tenantId,
      roles: ["OWNER"],
      perms: ["catalog.manage", "catalog.read"],
      aud: "mgmt-app" as const
    };

    // Crear producto original con código EAN-13 válido
    const barcode = "7702004003508";
    const createRes = await bff.handleRequest({
      method: "POST",
      path: "/v1/app/products",
      ip: "190.14.20.1",
      headers: {},
      claims,
      body: {
        sku: "GAS-400",
        name: "Gaseosa 400ml",
        basePriceCents: 2_500_000,
        costCents: 1_800_000,
        barcode
      }
    }, t0);
    expect(createRes.status).toBe(201);
    const prodId = (createRes.body as any).id;

    // Escaneo con cámara -> GET /v1/app/products/by-barcode/:barcode
    const scanRes = await bff.handleRequest({
      method: "GET",
      path: `/v1/app/products/by-barcode/${barcode}`,
      ip: "190.14.20.1",
      headers: {},
      claims
    }, t0 + 500);
    expect(scanRes.status).toBe(200);
    expect((scanRes.body as any).name).toBe("Gaseosa 400ml");

    // Clonar producto con nuevo sabor y código EAN-13 válido
    const cloneRes = await bff.handleRequest({
      method: "POST",
      path: `/v1/app/products/${prodId}/duplicate`,
      ip: "190.14.20.1",
      headers: {},
      claims,
      body: {
        newName: "Gaseosa Manzana 400ml",
        newBarcode: "7702004003515"
      }
    }, t0 + 1000);
    expect(cloneRes.status).toBe(201);
    expect((cloneRes.body as any).name).toBe("Gaseosa Manzana 400ml");
  });

  it("HU-102 & HU-235: Castigo de cartera con Step-up MFA y supresión de datos Habeas Data", async () => {
    const cust = bff.customerService.upsertCustomerWithOptionalInitialBalance({
      tenantId,
      fullName: "Pedro Moroso",
      docNumber: "12345678",
      phone: "3101234567",
      creditEnabled: true,
      creditLimitCents: 5_000_000,
      initialBalanceCents: 0,
      nowMs: t0
    });

    // Agregar deuda de $30.000 COP
    bff.customerService.applyCreditMovementEvent({
      eventId: newId(),
      tenantId,
      customerId: cust.id,
      kind: "CHARGE",
      deltaCents: 3_000_000,
      occurredAtMs: t0
    });

    const claimsRecentMfa = {
      sub: ownerId,
      tid: tenantId,
      roles: ["OWNER"],
      perms: ["customer.manage", "customer.credit_manage"],
      aud: "mgmt-app" as const,
      amr: ["pwd", "mfa"],
      mfa_authenticated_at: Math.floor(t0 / 1000)
    };

    // 1. Intento de suprimir datos con deuda activa falla con 409
    const supFail = await bff.handleRequest({
      method: "POST",
      path: `/v1/app/customers/${cust.id}/suppress-data`,
      ip: "190.14.20.1",
      headers: {},
      claims: claimsRecentMfa
    }, t0 + 1000);
    expect(supFail.status).toBe(409);

    // 2. HU-446: Con deuda activa, validación de Ley 2300 en horario nocturno (3am) prohíbe el contacto (OUTSIDE_HOURS)
    const checkNight = await bff.handleRequest({
      method: "POST",
      path: `/v1/app/customers/${cust.id}/contact-check`,
      ip: "190.14.20.1",
      headers: {},
      claims: claimsRecentMfa,
      body: { channel: "SMS", targetIsDebtorOrCodebtor: true }
    }, t0 + 1500); // 3:53 AM Colombia
    expect(checkNight.status).toBe(200);
    expect((checkNight.body as any).allowed).toBe(false);
    expect((checkNight.body as any).code).toBe("OUTSIDE_HOURS");

    // En horario hábil legal (9:53 AM), el contacto es autorizado
    const tDay = t0 + 6 * 3600 * 1000; // 09:53 AM Colombia
    const checkDay = await bff.handleRequest({
      method: "POST",
      path: `/v1/app/customers/${cust.id}/contact-check`,
      ip: "190.14.20.1",
      headers: {},
      claims: claimsRecentMfa,
      body: { channel: "SMS", targetIsDebtorOrCodebtor: true }
    }, tDay);
    expect(checkDay.status).toBe(200);
    expect((checkDay.body as any).allowed).toBe(true);

    const logRes = await bff.handleRequest({
      method: "POST",
      path: `/v1/app/customers/${cust.id}/contact-log`,
      ip: "190.14.20.1",
      headers: {},
      claims: claimsRecentMfa,
      body: { channel: "SMS", targetIsDebtorOrCodebtor: true, notes: "Recordatorio amable de cuota" }
    }, tDay + 100);
    expect(logRes.status).toBe(201);
    expect((logRes.body as any).contactId).toBeDefined();

    const auditRes = await bff.handleRequest({
      method: "GET",
      path: `/v1/app/customers/${cust.id}/contact-audit`,
      ip: "190.14.20.1",
      headers: {},
      claims: claimsRecentMfa
    }, tDay + 200);
    expect(auditRes.status).toBe(200);
    expect(Array.isArray(auditRes.body)).toBe(true);
    expect((auditRes.body as any[]).length).toBe(1);

    // 3. Castigo de cartera (Write-off) con Step-up MFA
    const writeOffRes = await bff.handleRequest({
      method: "POST",
      path: `/v1/app/customers/${cust.id}/write-off`,
      ip: "190.14.20.1",
      headers: {},
      claims: claimsRecentMfa,
      body: { reason: "Cliente incobrable" }
    }, t0 + 2000);
    expect(writeOffRes.status).toBe(200);

    // 4. Con deuda en $0, la supresión de datos Habeas Data es exitosa
    const supOk = await bff.handleRequest({
      method: "POST",
      path: `/v1/app/customers/${cust.id}/suppress-data`,
      ip: "190.14.20.1",
      headers: {},
      claims: claimsRecentMfa
    }, t0 + 3000);
    expect(supOk.status).toBe(200);
    expect((supOk.body as any).anonymized).toBe(true);

    // 5. Con deuda en $0, Ley 2300 prohíbe nuevos contactos de cobranza (NO_ACTIVE_DEBT)
    const checkNoDebt = await bff.handleRequest({
      method: "POST",
      path: `/v1/app/customers/${cust.id}/contact-check`,
      ip: "190.14.20.1",
      headers: {},
      claims: claimsRecentMfa,
      body: { channel: "SMS", targetIsDebtorOrCodebtor: true }
    }, t0 + 4000);
    expect(checkNoDebt.status).toBe(200);
    expect((checkNoDebt.body as any).allowed).toBe(false);
    expect((checkNoDebt.body as any).code).toBe("NO_ACTIVE_DEBT");
  });

  it("HU-357 & HU-358: Calculadora rápida de margen y actualización masiva de precios con Step-up MFA y redondeo $50 COP", async () => {
    // 1. Calculadora rápida de margen (HU-357): paca de 24 cervezas a $60.000 COP con margen 25%
    const calcRes = await bff.handleRequest({
      method: "POST",
      path: "/v1/app/catalog/quick-margin-calc",
      ip: "190.14.20.1",
      headers: {},
      claims: {
        sub: ownerId,
        tid: tenantId,
        roles: ["OWNER"],
        perms: ["catalog.read"],
        aud: "mgmt-app"
      },
      body: {
        packCostCents: 6_000_000, // $60.000 COP
        unitsPerPack: 24, // $2.500 COP costo unitario
        targetMarginRatio: 0.25 // 25% margen deseado
      }
    }, t0);
    expect(calcRes.status).toBe(200);
    const calcBody = calcRes.body as any;
    expect(calcBody.unitCostCents).toBe(250_000); // $2.500 COP
    // Precio venta antes de redondeo: $2.500 / 0.75 = $3.333 COP
    // Redondeado a $50 COP (5.000 cents): $3.350 COP = 335.000 cents
    expect(calcBody.suggestedPriceCents).toBe(335_000);

    // 2. Crear dos productos en el catálogo
    const prod1 = bff.catalogService.createProduct({
      tenantId,
      sku: "CERV-001",
      name: "Cerveza Poker 330ml",
      basePriceCents: 300_000,
      costCents: 220_000
    });
    const prod2 = bff.catalogService.createProduct({
      tenantId,
      sku: "CERV-002",
      name: "Cerveza Águila 330ml",
      basePriceCents: 300_000,
      costCents: 220_000
    });

    // 3. Actualización masiva del 10% exige Step-up MFA
    const bulkNoMfa = await bff.handleRequest({
      method: "POST",
      path: "/v1/app/catalog/bulk-price-update",
      ip: "190.14.20.1",
      headers: {},
      claims: {
        sub: ownerId,
        tid: tenantId,
        roles: ["OWNER"],
        perms: ["catalog.manage"],
        aud: "mgmt-app",
        amr: ["pwd"] // sin MFA
      },
      body: { percentDelta: 10 }
    }, t0);
    expect(bulkNoMfa.status).toBe(403);
    expect((bulkNoMfa.body as any).code).toBe("STEP_UP_MFA_REQUIRED");

    // 4. Con Step-up MFA: sube 10% ($3.000 + 10% = $3.300 COP)
    const bulkWithMfa = await bff.handleRequest({
      method: "POST",
      path: "/v1/app/catalog/bulk-price-update",
      ip: "190.14.20.1",
      headers: {},
      claims: {
        sub: ownerId,
        tid: tenantId,
        roles: ["OWNER"],
        perms: ["catalog.manage"],
        aud: "mgmt-app",
        amr: ["pwd", "mfa"],
        mfa_authenticated_at: Math.floor(t0 / 1000)
      },
      body: { percentDelta: 10 }
    }, t0 + 1000);
    expect(bulkWithMfa.status).toBe(200);
    expect((bulkWithMfa.body as any).updatedCount).toBeGreaterThanOrEqual(2);

    const updatedP1 = bff.catalogService.products.get(prod1.id);
    expect(updatedP1?.base_price_cents).toBe(330_000); // $3.300 COP
  });

  it("HU-232, HU-236 & HU-423: Conversión de genérico a catálogo, conciliación digital y Kardex", async () => {
    // 1. Conversión de artículo genérico vendido a producto formal (HU-232)
    const genSale = bff.catalogService.recordGenericItemSold({
      tenantId,
      saleId: "sale-gen-001",
      description: "Recarga celular Claro 10mil",
      unitPriceCents: 1_000_000,
      qtyMilli: 1000
    });

    const convRes = await bff.handleRequest({
      method: "POST",
      path: "/v1/app/catalog/convert-generic",
      ip: "190.14.20.1",
      headers: {},
      claims: {
        sub: ownerId,
        tid: tenantId,
        roles: ["OWNER"],
        perms: ["catalog.manage"],
        aud: "mgmt-app"
      },
      body: {
        genericSaleId: genSale.id,
        sku: "REC-CLARO-10K",
        barcode: "7702004003508"
      }
    }, t0 + 500);
    expect(convRes.status).toBe(201);
    expect((convRes.body as any).sku).toBe("REC-CLARO-10K");

    // 2. Recepción de compra y consulta de Kardex (HU-423)
    const mainBranch = [...bff.tenantService.branches.values()].find((b) => b.tenant_id === tenantId)!;
    const prodId = (convRes.body as any).id;

    await bff.handleRequest({
      method: "POST",
      path: "/v1/app/inventory/receptions",
      ip: "190.14.20.1",
      headers: {},
      claims: {
        sub: ownerId,
        tid: tenantId,
        roles: ["OWNER"],
        perms: ["inventory.manage"],
        aud: "mgmt-app"
      },
      body: {
        warehouseId: mainBranch.default_warehouse_id,
        lines: [{ productId: prodId, qtyMilli: 50_000, unitCostCents: 950_000 }]
      }
    }, t0 + 1000);

    const kardexRes = await bff.handleRequest({
      method: "GET",
      path: `/v1/app/inventory/kardex/${prodId}`,
      ip: "190.14.20.1",
      headers: {},
      claims: {
        sub: ownerId,
        tid: tenantId,
        roles: ["OWNER"],
        perms: ["inventory.read"],
        aud: "mgmt-app"
      }
    }, t0 + 1500);
    expect(kardexRes.status).toBe(200);
    expect((kardexRes.body as any).length).toBe(1);
    expect((kardexRes.body as any)[0].kind).toBe("RECEIPT");

    // 3. Conciliación de pagos digitales en lote (HU-236)
    const payId = newId();
    bff.salesService.payments.set(payId, {
      payment_id: payId,
      sale_id: "s1",
      tenant_id: tenantId,
      branch_id: mainBranch.id,
      cash_session_id: "session-01",
      method: "NEQUI",
      amount_cents: 500_000,
      reference: "NEQ-987654",
      reconciliation_status: "PENDING",
      reconciled_by: null
    });

    const reconRes = await bff.handleRequest({
      method: "POST",
      path: "/v1/app/sales/reconcile-digital-payments",
      ip: "190.14.20.1",
      headers: {},
      claims: {
        sub: ownerId,
        tid: tenantId,
        roles: ["OWNER"],
        perms: ["reports.read"],
        aud: "mgmt-app"
      },
      body: {
        paymentIds: [payId],
        status: "CONFIRMED"
      }
    }, t0 + 2000);
    expect(reconRes.status).toBe(200);
    expect((reconRes.body as any).reconciledCount).toBe(1);
  });

  it("HU-497: expone especificación OpenAPI 3.1 (/openapi.json) y portal de documentación interactiva (/docs)", async () => {
    const specRes = await bff.handleRequest({
      method: "GET",
      path: "/openapi.json",
      ip: "127.0.0.1",
      headers: {}
    });
    expect(specRes.status).toBe(200);
    expect(specRes.headers["Content-Type"]).toContain("application/json");
    const openapi = specRes.body as any;
    expect(openapi.openapi).toBe("3.1.0");
    expect(openapi.info.title).toContain("TienditaOnline");
    expect(openapi.paths["/v1/sync/push"]).toBeDefined();

    const docsRes = await bff.handleRequest({
      method: "GET",
      path: "/docs",
      ip: "127.0.0.1",
      headers: {}
    });
    expect(docsRes.status).toBe(200);
    expect(docsRes.headers["Content-Type"]).toContain("text/html");
    expect(docsRes.body).toContain("api-reference");
  });
});
