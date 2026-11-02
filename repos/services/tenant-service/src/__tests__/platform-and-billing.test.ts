import crypto from "node:crypto";
import { describe, it, expect, beforeEach } from "vitest";
import { TenantService } from "../index.js";
import { PlatformBillingAndDunningService } from "../platform-and-billing.js";

describe("Platform Console, SaaS Billing & Dunning Engine (ÉPICA 12)", () => {
  let tenantService: TenantService;
  let platformService: PlatformBillingAndDunningService;

  beforeEach(() => {
    tenantService = new TenantService();
    platformService = new PlatformBillingAndDunningService(tenantService);
  });

  describe("HU-111 & HU-261..HU-263: Saga de Creación JIT de Tienda", () => {
    it("crea exitosamente tienda con validación de NIT y DV oficial DIAN", async () => {
      // NIT 901234567 tiene DV = 7
      const sagaResult = await platformService.orchestrateCreateTenantSaga({
        businessName: "Minimercado La 80",
        documentType: "NIT",
        documentNumber: "901234567",
        nitDv: 7,
        planCode: "NEGOCIO",
        ownerEmail: "dueno@la80.co",
        actorId: "super_admin_01"
      });

      expect(sagaResult.tenantId).toBeDefined();
      expect(sagaResult.terminalCode).toBe("CAJA-01");
      expect(sagaResult.activationToken).toContain("act_");

      const createdTenant = tenantService.tenants.get(sagaResult.tenantId);
      expect(createdTenant?.status).toBe("TRIAL");
      expect(createdTenant?.plan_code).toBe("NEGOCIO");
      expect(createdTenant?.nit).toBe("901234567-7");
    });

    it("rechaza la saga si el Dígito de Verificación (DV) no coincide con el algoritmo DIAN", async () => {
      await expect(
        platformService.orchestrateCreateTenantSaga({
          businessName: "Tienda Falsa",
          documentType: "NIT",
          documentNumber: "901234567",
          nitDv: 9, // Incorrecto (debe ser 1)
          planCode: "TENDERO",
          ownerEmail: "fake@tienda.com",
          actorId: "admin"
        })
      ).rejects.toThrow("INVALID_NIT_DV");
    });
  });

  describe("HU-113 & HU-114: Facturación SaaS, Webhooks HMAC y Pagos Manuales", () => {
    it("procesa webhook firmado con HMAC y reactiva tienda suspendida", () => {
      const tenant = tenantService.createTenant({
        businessName: "Tienda Morosa",
        planCode: "TENDERO",
        initialStatus: "SUSPENDED",
        actorId: "admin"
      });

      const inv = platformService.createInvoice({
        tenantId: tenant.tenantId,
        planCode: "TENDERO",
        amountCents: 4990000,
        periodStartMs: 1000000,
        periodEndMs: 1000000 + 30 * 86400000,
        dueDateMs: 1000000
      });

      const secret = "wompi_secret_production_key_123";
      const rawPayload = JSON.stringify({ id: inv.id, status: "APPROVED", amount_in_cents: 4990000 });
      const validSignature = crypto.createHmac("sha256", secret).update(rawPayload).digest("hex");

      const res = platformService.processPaymentWebhook({
        invoiceId: inv.id,
        status: "APPROVED",
        amountCents: 4990000,
        rawPayload,
        receivedHmacSignature: validSignature,
        secretKey: secret
      });

      expect(res.processed).toBe(true);
      expect(res.newStatus).toBe("ACTIVE");
      expect(inv.status).toBe("PAID");
    });

    it("rechaza webhooks con firma HMAC alterada o inválida", () => {
      const inv = platformService.createInvoice({
        tenantId: "t1",
        planCode: "TENDERO",
        amountCents: 4990000,
        periodStartMs: 1000,
        periodEndMs: 2000,
        dueDateMs: 1000
      });

      expect(() =>
        platformService.processPaymentWebhook({
          invoiceId: inv.id,
          status: "APPROVED",
          amountCents: 4990000,
          rawPayload: "{}",
          receivedHmacSignature: "invalid_tampered_signature",
          secretKey: "secret"
        })
      ).toThrow("INVALID_WEBHOOK_SIGNATURE");
    });

    it("HU-114: registra pago manual adjuntando comprobante y reactiva tienda", () => {
      const tenant = tenantService.createTenant({
        businessName: "Tienda Manual",
        planCode: "TENDERO",
        initialStatus: "RESTRICTED",
        actorId: "admin"
      });

      const inv = platformService.createInvoice({
        tenantId: tenant.tenantId,
        planCode: "TENDERO",
        amountCents: 4990000,
        periodStartMs: 1000,
        periodEndMs: 2000,
        dueDateMs: 1000
      });

      const result = platformService.recordManualPayment({
        invoiceId: inv.id,
        paymentMethod: "NEQUI",
        proofUrl: "https://s3.tiendita.local/receipts/nequi_123.jpg",
        actorId: "super_admin_camilo"
      });

      expect(result.invoice.status).toBe("PAID");
      expect(result.invoice.paymentProofUrl).toContain("nequi_123.jpg");
      expect(result.tenantStatus).toBe("ACTIVE");
    });
  });

  describe("HU-115..HU-118, HU-291 & HU-489: Motor de Mora (Dunning) y Prórrogas", () => {
    it("otorga prórroga de hasta 7 días respetando el límite de 2 por año", () => {
      const tenantId = "t-prorroga";
      const invId = "inv-01";
      const now = 1000000;

      // Primera prórroga (5 días)
      const g1 = platformService.grantGraceExtension({
        tenantId,
        invoiceId: invId,
        days: 5,
        reason: "Calamidad doméstica",
        actorId: "admin",
        nowMs: now
      });
      expect(g1.extraDays).toBe(5);

      // Segunda prórroga (3 días)
      const g2 = platformService.grantGraceExtension({
        tenantId,
        invoiceId: invId,
        days: 3,
        reason: "Espera de pago PSE",
        actorId: "admin",
        nowMs: now + 1000
      });
      expect(g2.extraDays).toBe(3);

      // Tercera prórroga rechazada por exceder límite anual (HU-118)
      expect(() =>
        platformService.grantGraceExtension({
          tenantId,
          invoiceId: invId,
          days: 2,
          reason: "Tercera prórroga no permitida",
          actorId: "admin",
          nowMs: now + 2000
        })
      ).toThrow("GRACE_EXTENSION_LIMIT_REACHED");
    });

    it("ejecuta ciclo progresivo de mora: D+1 PAST_DUE, D+7 RESTRICTED, D+15 SUSPENDED, D+60 CANCELLED", () => {
      const baseDueDateMs = 100_000_000;
      const tenant = tenantService.createTenant({
        businessName: "Tienda Ciclo Mora",
        planCode: "TENDERO",
        initialStatus: "ACTIVE",
        actorId: "admin"
      });

      const inv = platformService.createInvoice({
        tenantId: tenant.tenantId,
        planCode: "TENDERO",
        amountCents: 4990000,
        periodStartMs: baseDueDateMs - 30 * 86400000,
        periodEndMs: baseDueDateMs,
        dueDateMs: baseDueDateMs
      });

      // 1. D+1: debe pasar a PAST_DUE
      platformService.runDailyDunningEvaluation(baseDueDateMs + 1 * 86400000);
      expect(tenantService.tenants.get(tenant.tenantId)?.status).toBe("PAST_DUE");

      // 2. D+7: debe pasar a RESTRICTED (App de gestión solo lectura)
      platformService.runDailyDunningEvaluation(baseDueDateMs + 7 * 86400000);
      expect(tenantService.tenants.get(tenant.tenantId)?.status).toBe("RESTRICTED");

      // 3. D+15: debe pasar a SUSPENDED (Bloqueo de caja)
      platformService.runDailyDunningEvaluation(baseDueDateMs + 15 * 86400000);
      expect(tenantService.tenants.get(tenant.tenantId)?.status).toBe("SUSPENDED");

      // 4. D+60: debe pasar a CANCELLED
      platformService.runDailyDunningEvaluation(baseDueDateMs + 60 * 86400000);
      expect(tenantService.tenants.get(tenant.tenantId)?.status).toBe("CANCELLED");
    });

    it("HU-489: suspende automáticamente tiendas TRIAL vencidas tras 15 días + 3 de cortesía", () => {
      const now = 100_000_000;
      const tenant = tenantService.createTenant({
        businessName: "Tienda En Prueba",
        planCode: "TENDERO",
        initialStatus: "TRIAL",
        paidUntilMs: now,
        actorId: "admin"
      });

      // 2 días después de vencer: aún dentro de cortesía
      platformService.runDailyDunningEvaluation(now + 2 * 86400000);
      expect(tenantService.tenants.get(tenant.tenantId)?.status).toBe("TRIAL");

      // 4 días después de vencer: pasa a SUSPENDED
      platformService.runDailyDunningEvaluation(now + 4 * 86400000);
      expect(tenantService.tenants.get(tenant.tenantId)?.status).toBe("SUSPENDED");
    });
  });

  describe("HU-250, HU-112 & HU-254: Métricas Globales, Soporte JIT y Dead Letter Topics", () => {
    it("HU-250: calcula MRR y desglose de estados para el Super Admin", () => {
      tenantService.createTenant({ businessName: "T1", planCode: "TENDERO", initialStatus: "ACTIVE", actorId: "admin" });
      tenantService.createTenant({ businessName: "T2", planCode: "NEGOCIO", initialStatus: "ACTIVE", actorId: "admin" });
      tenantService.createTenant({ businessName: "T3", planCode: "TENDERO", initialStatus: "TRIAL", actorId: "admin" });
      tenantService.createTenant({ businessName: "T4", planCode: "TENDERO", initialStatus: "SUSPENDED", actorId: "admin" });

      const metrics = platformService.getGlobalDashboardMetrics();
      expect(metrics.activeTenantsCount).toBe(2);
      expect(metrics.trialTenantsCount).toBe(1);
      expect(metrics.suspendedTenantsCount).toBe(1);
      // MRR: TENDERO (49.900) + NEGOCIO (89.900) = 139.800 COP (13.980.000 centavos)
      expect(metrics.mrrCents).toBe(13_980_000);
    });

    it("HU-112: genera sesión JIT de soporte técnico con vencimiento a 30 minutos", () => {
      const now = 1000000;
      const session = platformService.grantJustInTimeSupportSession({
        tenantId: "t-support-1",
        actorId: "admin_soporte",
        reason: "Ayuda con configuración de báscula",
        nowMs: now
      });

      expect(session.expiresAtMs).toBe(now + 30 * 60 * 1000);
      expect(session.reason).toBe("Ayuda con configuración de báscula");
    });

    it("HU-254: registra y permite reprocesar mensajes en Dead Letter Topics (*.dlt)", () => {
      const dlt = platformService.recordDltMessage("sales.recorded.dlt", { saleId: "s1" }, "Timeout connecting to DB");
      expect(dlt.status).toBe("PENDING");

      const res = platformService.reprocessDltMessage(dlt.id);
      expect(res.reprocessed).toBe(true);
      expect(res.message.status).toBe("REPROCESSED");
      expect(res.message.retryCount).toBe(1);
    });
  });
});
