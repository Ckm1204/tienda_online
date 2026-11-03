import { describe, it, expect, beforeEach } from "vitest";
import { BffApp, type HttpRequest } from "../index.js";

describe("BFF: Notificaciones Multicanal, Comprobantes DIAN y Ley 2300", () => {
  let bff: BffApp;
  const tenantId = "tenant-notif-01";
  const wednesday10am = new Date("2026-10-28T15:00:00Z").getTime(); // 10:00 AM Colombia (habíl)
  const sundayNoon = new Date("2026-11-01T17:00:00Z").getTime(); // Domingo (prohibido)

  const ownerClaims = {
    sub: "user-owner-01",
    tid: tenantId,
    aud: "mgmt-app",
    role: "OWNER",
    roles: ["OWNER"],
    perms: ["reports.read", "customer.credit_manage", "customer.read", "sales.create"]
  };

  beforeEach(() => {
    bff = new BffApp();
  });

  describe("POST /v1/app/notifications/invoice-receipt (HU-327 & Facturación DIAN)", () => {
    it("valida campos obligatorios y rechaza con 400 si faltan", async () => {
      const req: HttpRequest = {
        path: "/v1/app/notifications/invoice-receipt",
        method: "POST",
        headers: { "content-type": "application/json" },
        claims: ownerClaims,
        body: {
          invoiceNumber: "SETT-000001"
          // Faltan recipient, cude, qrUrl, totalCents
        }
      };

      const res = await bff.handleRequest(req, wednesday10am);
      expect(res.status).toBe(400);
      expect((res.body as any).error).toBe("MISSING_REQUIRED_FIELDS");
    });

    it("despacha comprobante de factura electrónica por WhatsApp con CUDE y QR oficial", async () => {
      const cude = "8934a8422763fb44a44ade61bd97945bc7b0270b38121f9056f4a9587940837d5c6307f35471a670264dfd6a57caa698";
      const qrUrl = "https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=" + cude;

      const req: HttpRequest = {
        path: "/v1/app/notifications/invoice-receipt",
        method: "POST",
        headers: { "content-type": "application/json" },
        claims: ownerClaims,
        body: {
          invoiceNumber: "SETT-000001",
          customerName: "Doña Martha Gómez",
          recipient: "+573104458821",
          channel: "WHATSAPP",
          totalCents: 930000, // $9.300 COP
          cude,
          qrUrl,
          tenantName: "Tienda La Esmeralda"
        }
      };

      const res = await bff.handleRequest(req, wednesday10am);
      expect(res.status).toBe(200);
      const data = res.body as any;
      expect(data.success).toBe(true);
      expect(data.channel).toBe("WHATSAPP");
      expect(data.renderedBody).toContain("Doña Martha Gómez");
      expect(data.renderedBody).toContain("SETT-000001");
      expect(data.renderedBody).toContain("$9.300");
      expect(data.renderedBody).toContain(cude);
      expect(data.renderedBody).toContain(qrUrl);
    });

    it("despacha comprobante de factura electrónica por EMAIL", async () => {
      const cude = "cude-email-384";
      const qrUrl = "https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=" + cude;

      const req: HttpRequest = {
        path: "/v1/app/notifications/invoice-receipt",
        method: "POST",
        headers: { "content-type": "application/json" },
        claims: ownerClaims,
        body: {
          invoiceNumber: "SETT-000002",
          customerName: "Don Carlos",
          recipient: "carlos@taller.co",
          channel: "EMAIL",
          totalCents: 530000,
          cude,
          qrUrl
        }
      };

      const res = await bff.handleRequest(req, wednesday10am);
      expect(res.status).toBe(200);
      const data = res.body as any;
      expect(data.channel).toBe("EMAIL");
      expect(data.renderedSubject).toContain("SETT-000002");
    });
  });

  describe("POST /v1/app/notifications/debt-reminder (HU-109, HU-364 & Ley 2300)", () => {
    it("bloquea el despacho de cobranza si se intenta en día u hora prohibida (Domingo)", async () => {
      // 1. Crear cliente con saldo activo
      const cust = bff.customerService.upsertCustomerWithOptionalInitialBalance({
        tenantId,
        fullName: "Deudor Domingo",
        docType: "CC",
        docNumber: "998877",
        phone: "+573001234567",
        creditEnabled: true,
        creditLimitCents: 50000000,
        initialBalanceCents: 15000000, // $150.000 COP
        nowMs: wednesday10am
      });

      const req: HttpRequest = {
        path: "/v1/app/notifications/debt-reminder",
        method: "POST",
        headers: { "content-type": "application/json" },
        claims: ownerClaims,
        body: {
          customerId: cust.id,
          recipient: "+573001234567",
          channel: "WHATSAPP"
        }
      };

      // Ejecutar en Domingo al mediodía -> Ley 2300 prohíbe taxativamente
      const res = await bff.handleRequest(req, sundayNoon);
      expect(res.status).toBe(400);
      const data = res.body as any;
      expect(data.error).toBe("LEY_2300_BLOCKED");
      expect(data.code).toBe("SUNDAY_PROHIBITED");
      expect(data.sicComplianceWarning).toContain("Ley 2300 de 2023");
    });

    it("permite el despacho en horario hábil y genera trazabilidad ante la SIC", async () => {
      // 1. Crear cliente con deuda activa
      const cust = bff.customerService.upsertCustomerWithOptionalInitialBalance({
        tenantId,
        fullName: "Doña Florinda",
        docType: "CC",
        docNumber: "554433",
        phone: "+573112223344",
        creditEnabled: true,
        creditLimitCents: 100000000,
        initialBalanceCents: 45000000, // $450.000 COP
        nowMs: wednesday10am
      });

      const req: HttpRequest = {
        path: "/v1/app/notifications/debt-reminder",
        method: "POST",
        headers: { "content-type": "application/json" },
        claims: ownerClaims,
        body: {
          customerId: cust.id,
          recipient: "+573112223344",
          channel: "WHATSAPP",
          customMessage: "Por favor pasar a abonar a la tienda antes del fin de semana."
        }
      };

      // Intento 1: permitido
      const res1 = await bff.handleRequest(req, wednesday10am);
      expect(res1.status).toBe(200);
      const data1 = res1.body as any;
      expect(data1.success).toBe(true);
      expect(data1.renderedBody).toContain("Doña Florinda");
      expect(data1.renderedBody).toContain("$450.000 COP");
      expect(data1.sicAuditContactId).toBeDefined();

      // Intento 2 en la misma semana (Jueves 10 AM): permitido
      const thursday10am = wednesday10am + 24 * 60 * 60 * 1000;
      const res2 = await bff.handleRequest(req, thursday10am);
      expect(res2.status).toBe(200);

      // Intento 3 en la misma semana (Viernes 10 AM): BLOQUEADO por límite de 2 contactos semanales
      const friday10am = thursday10am + 24 * 60 * 60 * 1000;
      const res3 = await bff.handleRequest(req, friday10am);
      expect(res3.status).toBe(400);
      const data3 = res3.body as any;
      expect(data3.error).toBe("LEY_2300_BLOCKED");
      expect(data3.code).toBe("WEEKLY_LIMIT_REACHED");
    });
  });

  describe("GET /v1/app/notifications", () => {
    it("retorna el historial de notificaciones del tenant", async () => {
      // Despachar una notificación
      await bff.notificationService.queueNotification({
        tenantId,
        userId: "u-01",
        recipient: "3001234567",
        channel: "PUSH",
        templateCode: "cash.discrepancy",
        payload: { amount: "$15.000", terminal_code: "CAJA-01" },
        dedupeKey: "k1",
        nowMs: wednesday10am
      });

      const req: HttpRequest = {
        path: "/v1/app/notifications",
        method: "GET",
        headers: { "content-type": "application/json" },
        claims: ownerClaims
      };

      const res = await bff.handleRequest(req, wednesday10am);
      expect(res.status).toBe(200);
      const data = res.body as any;
      expect(data.count).toBeGreaterThanOrEqual(1);
      expect(data.items.length).toBeGreaterThanOrEqual(1);
    });
  });
});
