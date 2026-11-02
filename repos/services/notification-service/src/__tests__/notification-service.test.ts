import { describe, it, expect, beforeEach } from "vitest";
import { NotificationService, Ley2300ComplianceEngine } from "../index.js";

describe("NotificationService & Ley 2300 Unit Tests (ÉPICA 11: FT-11.2)", () => {
  let service: NotificationService;
  let leyEngine: Ley2300ComplianceEngine;

  beforeEach(() => {
    service = new NotificationService();
    leyEngine = new Ley2300ComplianceEngine();
  });

  describe("HU-109 & HU-364: Cumplimiento de la Ley 2300 de 2023 ('Dejen de fregar')", () => {
    it("permite contacto de cobranza de Lunes a Viernes entre 07:00 y 19:00 hora Colombia", () => {
      // 2026-10-28 es Miércoles
      // 10:00 AM Colombia (UTC 15:00)
      const wednesday10am = new Date("2026-10-28T15:00:00Z").getTime();
      expect(leyEngine.isLegalContactTime(wednesday10am)).toBe(true);

      // 20:00 PM Colombia (UTC 01:00 día siguiente) -> Fuera de horario legal
      const wednesday8pm = new Date("2026-10-29T01:00:00Z").getTime();
      expect(leyEngine.isLegalContactTime(wednesday8pm)).toBe(false);
    });

    it("permite contacto los Sábados entre 08:00 y 15:00 hora Colombia", () => {
      // 2026-10-31 es Sábado
      // 10:00 AM Colombia (UTC 15:00)
      const saturday10am = new Date("2026-10-31T15:00:00Z").getTime();
      expect(leyEngine.isLegalContactTime(saturday10am)).toBe(true);

      // 16:00 PM Colombia (UTC 21:00) -> Pasadas las 3:00 PM
      const saturday4pm = new Date("2026-10-31T21:00:00Z").getTime();
      expect(leyEngine.isLegalContactTime(saturday4pm)).toBe(false);
    });

    it("prohíbe estrictamente contactos los Domingos y días Festivos oficiales", () => {
      // 2026-11-01 es Domingo
      const sundayNoon = new Date("2026-11-01T17:00:00Z").getTime();
      expect(leyEngine.isLegalContactTime(sundayNoon)).toBe(false);

      // 2026-11-02 es Festivo (Todos los Santos)
      const holidayMondayNoon = new Date("2026-11-02T17:00:00Z").getTime();
      expect(leyEngine.isLegalContactTime(holidayMondayNoon)).toBe(false);
    });

    it("limita a máximo 2 contactos semanales por deudor", () => {
      const debtorId = "debtor-marta-01";
      const wednesday = new Date("2026-10-28T15:00:00Z").getTime();

      // Primer contacto permitido
      expect(leyEngine.canContactDebtorThisWeek(debtorId, wednesday)).toBe(true);
      leyEngine.recordContact(debtorId, wednesday);

      // Segundo contacto permitido
      expect(leyEngine.canContactDebtorThisWeek(debtorId, wednesday)).toBe(true);
      leyEngine.recordContact(debtorId, wednesday);

      // Tercer contacto bloqueado por ley
      expect(leyEngine.canContactDebtorThisWeek(debtorId, wednesday)).toBe(false);
    });
  });

  describe("HU-108 & HU-306: Deduplicación, Plantillas y Circuit Breakers", () => {
    it("deduplica notificaciones repetidas con dedupe_key", async () => {
      const wednesday = new Date("2026-10-28T15:00:00Z").getTime();
      const dedupeKey = "cash_shift_123_discrepancy";

      const notif1 = await service.queueNotification({
        tenantId: "t1",
        userId: "u1",
        recipient: "3001234567",
        channel: "PUSH",
        templateCode: "cash.discrepancy",
        payload: { amount: "$25.000", terminal_code: "CAJA-01" },
        dedupeKey,
        nowMs: wednesday
      });

      const notif2 = await service.queueNotification({
        tenantId: "t1",
        userId: "u1",
        recipient: "3001234567",
        channel: "PUSH",
        templateCode: "cash.discrepancy",
        payload: { amount: "$25.000", terminal_code: "CAJA-01" },
        dedupeKey,
        nowMs: wednesday
      });

      expect(notif1.id).toBe(notif2.id);
      expect(service.notifications.size).toBe(1);
    });

    it("encola recordatorios fuera de horario legal para la siguiente ventana hábil", async () => {
      const sundayNoon = new Date("2026-11-01T17:00:00Z").getTime(); // Domingo

      const queuedNotif = await service.queueNotification({
        tenantId: "t1",
        userId: "u1",
        recipient: "3001234567",
        channel: "WHATSAPP",
        templateCode: "debt.reminder",
        payload: { customer_name: "Doña Marta", tenant_name: "Tienda El Sol", amount: "$50.000" },
        dedupeKey: "debt_reminder_marta_nov1",
        isDebtCollection: true,
        debtorId: "debtor-marta",
        nowMs: sundayNoon
      });

      expect(queuedNotif.status).toBe("QUEUED");
      expect(queuedNotif.scheduledForMs).toBeGreaterThan(sundayNoon);
    });

    it("despacha por canal de respaldo si el circuit breaker del canal principal está abierto (HU-306)", async () => {
      const wednesday = new Date("2026-10-28T15:00:00Z").getTime();

      // Forzar apertura de breaker de WhatsApp
      const waBreaker = service.breakers.WHATSAPP;
      for (let i = 0; i < 3; i++) {
        try {
          await waBreaker.execute(async () => {
            throw new Error("Meta WhatsApp API 500");
          }, { nowMs: wednesday });
        } catch {}
      }
      expect(waBreaker.getState(wednesday)).toBe("OPEN");

      const notif = await service.queueNotification({
        tenantId: "t1",
        userId: "u1",
        recipient: "3001234567",
        channel: "WHATSAPP",
        templateCode: "debt.reminder",
        payload: { amount: "$10.000" },
        dedupeKey: "crit_01",
        nowMs: wednesday
      });

      // Debe haber caído al canal de respaldo EMAIL
      expect(notif.status).toBe("SENT");
      expect(notif.channel).toBe("EMAIL");
      expect(notif.provider).toBe("fallback_backup");
    });
  });
});
