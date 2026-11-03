import { describe, it, expect, beforeEach } from "vitest";
import { calculateNitDv } from "@tiendita/contracts";
import { BffApp, type HttpRequest } from "../index.js";

describe("ÉPICA 12 — BFF Gateway: Consola del Super Admin (Saga de Tienda, Facturación SaaS, Mora, Licencias Locales y JIT)", () => {
  let bff: BffApp;
  let t0: number;

  const superAdminClaims = {
    sub: "super-admin-01",
    aud: "platform" as const,
    roles: ["SUPER_ADMIN"],
    perms: ["platform.manage", "tenants.manage", "billing.manage"]
  };

  const cashierClaims = {
    sub: "cashier-01",
    tid: "tenant-random",
    aud: "mgmt-app" as const,
    roles: ["CASHIER"],
    perms: ["sales.create"]
  };

  beforeEach(() => {
    bff = new BffApp();
    t0 = 1_760_000_000_000;
  });

  it("Seguridad: Rechaza con 403 a usuarios sin rol SUPER_ADMIN o sin audiencia platform", async () => {
    const req: HttpRequest = {
      method: "GET",
      path: "/v1/platform/metrics",
      ip: "190.14.20.1",
      headers: {},
      claims: cashierClaims
    };
    const res = await bff.handleRequest(req, t0);
    expect(res.status).toBe(403);
    expect((res.body as any).code).toBe("FORBIDDEN_SUPER_ADMIN_REQUIRED");
  });

  it("POST /v1/platform/tenants: Ejecuta Saga completa con validación Módulo 11 DIAN, usuario dueño y CAJA-01", async () => {
    // 1. Rechazo con NIT DV incorrecto
    const badNitReq: HttpRequest = {
      method: "POST",
      path: "/v1/platform/tenants",
      ip: "127.0.0.1",
      headers: { "content-type": "application/json" },
      claims: superAdminClaims,
      body: {
        businessName: "Supermercado El Cóndor",
        documentType: "NIT",
        documentNumber: "900123456",
        nitDv: 9, // DV real es 6
        planCode: "NEGOCIO",
        ownerEmail: "condor@tienda.co"
      }
    };
    const badNitRes = await bff.handleRequest(badNitReq, t0);
    expect(badNitRes.status).toBe(400);
    expect((badNitRes.body as any).detail).toContain("Dígito de verificación inválido");

    // 2. Creación exitosa con NIT y DV correcto
    const realDv = calculateNitDv("900123456");
    const validReq: HttpRequest = {
      method: "POST",
      path: "/v1/platform/tenants",
      ip: "127.0.0.1",
      headers: { "content-type": "application/json" },
      claims: superAdminClaims,
      body: {
        businessName: "Supermercado El Cóndor",
        documentType: "NIT",
        documentNumber: "900123456",
        nitDv: realDv,
        planCode: "NEGOCIO",
        ownerEmail: "condor@tienda.co",
        ownerPhone: "+573124455667",
        trialDays: 15
      }
    };

    const res = await bff.handleRequest(validReq, t0);
    expect(res.status).toBe(201);
    const body = res.body as any;
    expect(body.tenantId).toBeDefined();
    expect(body.mainBranchId).toBeDefined();
    expect(body.terminalCode).toBe("CAJA-01");
    expect(body.activationToken).toContain("act_");
    expect(body.status).toBe("TRIAL");

    // Verificar que el usuario dueño existe en identityService
    expect(bff.identityService.users.get(body.ownerUserId)).toBeDefined();
    expect(bff.identityService.users.get(body.ownerUserId)?.role_code).toBe("OWNER");

    // Verificar que la terminal CAJA-01 existe en deviceService
    expect(bff.deviceService.terminals.get(body.terminalId)).toBeDefined();
  });

  it("Directorio y Vista 360°: Permite búsqueda y consulta integral de la tienda", async () => {
    // Crear tienda de prueba
    const sagaRes = await bff.platformBillingService.orchestrateCreateTenantSaga({
      businessName: "Droguería San Jorge",
      documentType: "CC",
      documentNumber: "1098765432",
      planCode: "TENDERO",
      ownerEmail: "jorge@drogueria.co",
      actorId: "super-admin-01",
      nowMs: t0
    });

    // 1. Buscar en directorio
    const searchReq: HttpRequest = {
      method: "GET",
      path: "/v1/platform/tenants?q=San+Jorge",
      ip: "127.0.0.1",
      headers: {},
      claims: superAdminClaims
    };
    const searchRes = await bff.handleRequest(searchReq, t0);
    expect(searchRes.status).toBe(200);
    expect((searchRes.body as any).tenants).toHaveLength(1);
    expect((searchRes.body as any).tenants[0].businessName).toBe("Droguería San Jorge");

    // 2. Vista 360°
    const view360Req: HttpRequest = {
      method: "GET",
      path: `/v1/platform/tenants/${sagaRes.tenantId}`,
      ip: "127.0.0.1",
      headers: {},
      claims: superAdminClaims
    };
    const view360Res = await bff.handleRequest(view360Req, t0);
    expect(view360Res.status).toBe(200);
    const v360 = view360Res.body as any;
    expect(v360.tenant.id).toBe(sagaRes.tenantId);
    expect(v360.branches).toHaveLength(1);
    expect(v360.invoices).toHaveLength(1); // Factura proforma inicial
  });

  it("Suspensión, Reactivación y Prórrogas (HU-118, HU-405)", async () => {
    const saga = await bff.platformBillingService.orchestrateCreateTenantSaga({
      businessName: "Panadería La Floresta",
      documentType: "CC",
      documentNumber: "80123456",
      planCode: "NEGOCIO",
      ownerEmail: "floresta@pan.co",
      actorId: "super-admin-01",
      nowMs: t0
    });

    // 1. Suspender tienda
    const suspReq: HttpRequest = {
      method: "POST",
      path: `/v1/platform/tenants/${saga.tenantId}/suspend`,
      ip: "127.0.0.1",
      headers: { "content-type": "application/json" },
      claims: superAdminClaims,
      body: { reason: "Mora de pago superior a 15 días" }
    };
    const suspRes = await bff.handleRequest(suspReq, t0);
    expect(suspRes.status).toBe(200);
    expect((suspRes.body as any).status).toBe("SUSPENDED");

    // 2. Conceder prórroga de 5 días
    const invoices = [...bff.platformBillingService.invoices.values()].filter((i) => i.tenantId === saga.tenantId);
    const invoiceId = invoices[0]!.id;

    const graceReq: HttpRequest = {
      method: "POST",
      path: `/v1/platform/tenants/${saga.tenantId}/grace-extensions`,
      ip: "127.0.0.1",
      headers: { "content-type": "application/json" },
      claims: superAdminClaims,
      body: {
        invoiceId,
        days: 5,
        reason: "Acuerdo de pago quincenal solicitado por el cliente"
      }
    };
    const graceRes = await bff.handleRequest(graceReq, t0);
    expect(graceRes.status).toBe(200);
    expect((graceRes.body as any).extension.extraDays).toBe(5);

    // 3. Reactivar tienda
    const reactReq: HttpRequest = {
      method: "POST",
      path: `/v1/platform/tenants/${saga.tenantId}/reactivate`,
      ip: "127.0.0.1",
      headers: { "content-type": "application/json" },
      claims: superAdminClaims,
      body: { reason: "Cliente al día tras prórroga" }
    };
    const reactRes = await bff.handleRequest(reactReq, t0);
    expect(reactRes.status).toBe(200);
    expect((reactRes.body as any).status).toBe("ACTIVE");
  });

  it("Métricas Globales, Facturación y Pago Manual (HU-114, HU-250)", async () => {
    // Crear tienda activa
    const saga = await bff.platformBillingService.orchestrateCreateTenantSaga({
      businessName: "Ferretería El Tornillo",
      documentType: "NIT",
      documentNumber: "900555666",
      nitDv: calculateNitDv("900555666"),
      planCode: "MULTITIENDA",
      ownerEmail: "tornillo@ferre.co",
      actorId: "super-admin-01",
      nowMs: t0
    });

    // Activar tienda
    bff.tenantService.changeTenantStatus({
      tenantId: saga.tenantId,
      toStatus: "ACTIVE",
      reason: "Pago verificado",
      actorId: "super-admin-01",
      nowMs: t0
    });

    // 1. Métricas Globales
    const metricsReq: HttpRequest = {
      method: "GET",
      path: "/v1/platform/metrics",
      ip: "127.0.0.1",
      headers: {},
      claims: superAdminClaims
    };
    const metricsRes = await bff.handleRequest(metricsReq, t0);
    expect(metricsRes.status).toBe(200);
    const m = metricsRes.body as any;
    expect(m.activeTenantsCount).toBeGreaterThanOrEqual(1);
    expect(m.mrrCents).toBeGreaterThan(0);

    // 2. Pago Manual Nequi
    const inv = [...bff.platformBillingService.invoices.values()].find((i) => i.tenantId === saga.tenantId)!;
    const manualPayReq: HttpRequest = {
      method: "POST",
      path: `/v1/platform/billing/invoices/${inv.id}/manual-payment`,
      ip: "127.0.0.1",
      headers: { "content-type": "application/json" },
      claims: superAdminClaims,
      body: {
        paymentMethod: "NEQUI",
        proofUrl: "https://s3.tiendita.local/proofs/comprobante-nequi-1234.pdf"
      }
    };
    const manualPayRes = await bff.handleRequest(manualPayReq, t0);
    expect(manualPayRes.status).toBe(200);
    expect((manualPayRes.body as any).invoice.status).toBe("PAID");
    expect((manualPayRes.body as any).invoice.paymentMethod).toBe("NEQUI");
  });

  it("Edición Local: Emite serial de activación única y lista licencias con serial enmascarado (HU-121)", async () => {
    // 1. Emitir serial
    const issueReq: HttpRequest = {
      method: "POST",
      path: "/v1/platform/local-licenses",
      ip: "127.0.0.1",
      headers: { "content-type": "application/json" },
      claims: superAdminClaims,
      body: {
        customerName: "Don Gilberto Almacén",
        customerNitOrCc: "79123456",
        customerPhone: "+573001234567",
        edition: "LOCAL_PLUS",
        receiptPrefix: "L02"
      }
    };
    const issueRes = await bff.handleRequest(issueReq, t0);
    expect(issueRes.status).toBe(201);
    const lic = (issueRes.body as any).license;
    expect(lic.serialKey).toMatch(/^TDL-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}$/);
    expect(lic.serialLast4).toBeDefined();

    // 2. Listar licencias: debe ocultar serialKey en texto plano
    const listReq: HttpRequest = {
      method: "GET",
      path: "/v1/platform/local-licenses",
      ip: "127.0.0.1",
      headers: {},
      claims: superAdminClaims
    };
    const listRes = await bff.handleRequest(listReq, t0);
    expect(listRes.status).toBe(200);
    const licenses = (listRes.body as any).licenses;
    expect(licenses.length).toBeGreaterThanOrEqual(1);
    expect(licenses[0].serialKey).toBeUndefined(); // Seguridad: nunca expone el serial en listados
    expect(licenses[0].serialLast4).toBeDefined();
  });

  it("Soporte JIT: Emite sesión temporal con motivo y expiración de 30 minutos (HU-112)", async () => {
    const jitReq: HttpRequest = {
      method: "POST",
      path: "/v1/platform/support-access",
      ip: "127.0.0.1",
      headers: { "content-type": "application/json" },
      claims: superAdminClaims,
      body: {
        tenantId: "tenant-soporte-01",
        reason: "Asistencia remota para configuración de balanza RS-232"
      }
    };

    const jitRes = await bff.handleRequest(jitReq, t0);
    expect(jitRes.status).toBe(200);
    const session = (jitRes.body as any).session;
    expect(session.expiresAtMs - session.grantedAtMs).toBe(30 * 60 * 1000);
    expect(session.reason).toContain("balanza RS-232");
  });
});
