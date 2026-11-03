import { describe, it, expect, beforeEach } from "vitest";
import {
  CustomerService,
  computeEasterSunday,
  getColombianHolidays,
  isColombianHolidayOrRestDay,
  getColombiaDateComponents
} from "../index.js";

describe("CustomerService — Cartera, Derechos ARCO y Ley 2300 de 2023 ('Dejen de Fregar')", () => {
  let service: CustomerService;
  const tenantId = "tenant-col-01";

  beforeEach(() => {
    service = new CustomerService();
  });

  describe("ÉPICA 09 — Dominio de Clientes y Cartera", () => {
    it("crea cliente con saldo inicial y deduplica por tipo y número de documento (HU-093, HU-398)", () => {
      const c1 = service.upsertCustomerWithOptionalInitialBalance({
        tenantId,
        fullName: "Don Pedro Pérez",
        docType: "CC",
        docNumber: "12345678",
        phone: "3001234567",
        creditEnabled: true,
        creditLimitCents: 500_000,
        initialBalanceCents: 150_000
      });

      expect(c1.id).toBeDefined();
      expect(c1.balance_cents).toBe(150_000);
      expect(service.movements).toHaveLength(1);
      expect(service.movements[0]?.kind).toBe("INITIAL_BALANCE");

      // Intento de crear duplicado con el mismo documento
      const c2 = service.upsertCustomerWithOptionalInitialBalance({
        tenantId,
        fullName: "Pedro Pérez Copia",
        docType: "CC",
        docNumber: "12345678",
        creditEnabled: true,
        creditLimitCents: 500_000
      });

      expect(c2.id).toBe(c1.id); // Deduplicado
      expect(service.customers.size).toBe(1);
    });

    it("aplica movimientos de crédito y emite credit_limit_exceeded al sobrepasar cupo (HU-093)", () => {
      const c = service.upsertCustomerWithOptionalInitialBalance({
        tenantId,
        fullName: "Ana Gómez",
        creditEnabled: true,
        creditLimitCents: 100_000
      });

      // Cargo dentro del cupo ($80.000)
      const res1 = service.applyCreditMovementEvent({
        eventId: "evt-c1",
        tenantId,
        customerId: c.id,
        kind: "CHARGE",
        deltaCents: 80_000,
        occurredAtMs: Date.now()
      });
      expect(res1.newBalanceCents).toBe(80_000);
      expect(res1.limitExceededEmitted).toBe(false);

      // Cargo que supera cupo ($30.000 más -> total $110.000)
      const res2 = service.applyCreditMovementEvent({
        eventId: "evt-c2",
        tenantId,
        customerId: c.id,
        kind: "CHARGE",
        deltaCents: 30_000,
        occurredAtMs: Date.now()
      });
      expect(res2.newBalanceCents).toBe(110_000);
      expect(res2.limitExceededEmitted).toBe(true);
      expect(service.publishedEvents.some((e) => e.payload && (e.payload as any).type === "customer.credit_limit_exceeded")).toBe(true);
    });

    it("castiga cartera incobrable exigiendo MFA (HU-094, HU-399)", () => {
      const c = service.upsertCustomerWithOptionalInitialBalance({
        tenantId,
        fullName: "Carlos Deudor",
        creditEnabled: true,
        creditLimitCents: 200_000,
        initialBalanceCents: 180_000
      });

      expect(() =>
        service.writeOffCustomerDebt({
          tenantId,
          customerId: c.id,
          reason: "Cliente ilocalizable tras 1 año",
          mfaVerified: false // Sin MFA -> debe fallar
        })
      ).toThrow("403 STEP_UP_MFA_REQUIRED");

      const writtenOff = service.writeOffCustomerDebt({
        tenantId,
        customerId: c.id,
        reason: "Cliente ilocalizable tras 1 año",
        mfaVerified: true
      });
      expect(writtenOff.balance_cents).toBe(0);
      expect(service.movements.some((m) => m.kind === "WRITE_OFF")).toBe(true);
    });

    it("bloquea supresión de datos personales (ARCO) si existe deuda activa (HU-363)", () => {
      const c = service.upsertCustomerWithOptionalInitialBalance({
        tenantId,
        fullName: "Marta Con Deuda",
        creditEnabled: true,
        creditLimitCents: 100_000,
        initialBalanceCents: 50_000
      });

      expect(() => service.suppressCustomerPersonalData(tenantId, c.id)).toThrow(
        "409 CANNOT_SUPPRESS_DATA_WITH_ACTIVE_DEBT"
      );

      // Tras saldar la deuda, permite supresión/anonimización
      c.balance_cents = 0;
      const anonymized = service.suppressCustomerPersonalData(tenantId, c.id);
      expect(anonymized.anonymized).toBe(true);
      expect(anonymized.full_name).toContain("TITULAR ANONIMIZADO");
    });
  });

  describe("Motor de Calendario Oficial de Colombia (Ley 51 de 1983 - Ley Emiliani)", () => {
    it("calcula con precisión matemática el Domingo de Pascua para múltiples años", () => {
      expect(computeEasterSunday(2024)).toEqual({ month: 3, day: 31 }); // 31 Marzo 2024
      expect(computeEasterSunday(2025)).toEqual({ month: 4, day: 20 }); // 20 Abril 2025
      expect(computeEasterSunday(2026)).toEqual({ month: 4, day: 5 });  // 5 Abril 2026
      expect(computeEasterSunday(2027)).toEqual({ month: 3, day: 28 }); // 28 Marzo 2027
    });

    it("genera el listado oficial de 18 festivos colombianos para 2026", () => {
      const holidays2026 = getColombianHolidays(2026);
      expect(holidays2026.size).toBe(18);

      // Fijos
      expect(holidays2026.get("2026-01-01")).toBe("Año Nuevo");
      expect(holidays2026.get("2026-05-01")).toBe("Día del Trabajo");
      expect(holidays2026.get("2026-07-20")).toBe("Día de la Independencia");
      expect(holidays2026.get("2026-08-07")).toBe("Batalla de Boyacá");
      expect(holidays2026.get("2026-12-08")).toBe("Inmaculada Concepción");
      expect(holidays2026.get("2026-12-25")).toBe("Navidad");

      // Semana Santa
      expect(holidays2026.get("2026-04-02")).toBe("Jueves Santo");
      expect(holidays2026.get("2026-04-03")).toBe("Viernes Santo");

      // Emiliani
      expect(holidays2026.get("2026-01-12")).toBe("Reyes Magos (Epifanía)"); // 6 Ene martes -> 12 Ene lunes
      expect(holidays2026.get("2026-03-23")).toBe("Día de San José"); // 19 Mar jueves -> 23 Mar lunes
      expect(holidays2026.get("2026-06-29")).toBe("San Pedro y San Pablo");
      expect(holidays2026.get("2026-08-17")).toBe("Asunción de la Virgen"); // 15 Ago sábado -> 17 Ago lunes
      expect(holidays2026.get("2026-10-12")).toBe("Día de la Raza");
      expect(holidays2026.get("2026-11-02")).toBe("Todos los Santos"); // 1 Nov domingo -> 2 Nov lunes
      expect(holidays2026.get("2026-11-16")).toBe("Independencia de Cartagena"); // 11 Nov miércoles -> 16 Nov lunes

      // Pascua Emiliani
      expect(holidays2026.get("2026-05-18")).toBe("Ascensión del Señor");
      expect(holidays2026.get("2026-06-08")).toBe("Corpus Christi");
      expect(holidays2026.get("2026-06-15")).toBe("Sagrado Corazón de Jesús");
    });

    it("identifica domingos y festivos en hora legal colombiana (UTC-5)", () => {
      // 1 Mayo 2026 a las 10:00 AM Colombia (15:00 UTC) -> Festivo Día del Trabajo
      const diaTrabajoMs = new Date("2026-05-01T15:00:00Z").getTime();
      const resFestivo = isColombianHolidayOrRestDay(diaTrabajoMs);
      expect(resFestivo.isHoliday).toBe(true);
      expect(resFestivo.isRestDay).toBe(true);
      expect(resFestivo.holidayName).toBe("Día del Trabajo");

      // Domingo 3 Mayo 2026 a las 11:00 AM Colombia (16:00 UTC) -> Domingo
      const domingoMs = new Date("2026-05-03T16:00:00Z").getTime();
      const resDomingo = isColombianHolidayOrRestDay(domingoMs);
      expect(resDomingo.isSunday).toBe(true);
      expect(resDomingo.isRestDay).toBe(true);

      // Martes 5 Mayo 2026 a las 10:00 AM Colombia (15:00 UTC) -> Día hábil
      const martesHabilMs = new Date("2026-05-05T15:00:00Z").getTime();
      const resHabil = isColombianHolidayOrRestDay(martesHabilMs);
      expect(resHabil.isRestDay).toBe(false);
      expect(resHabil.isSunday).toBe(false);
      expect(resHabil.isHoliday).toBe(false);
    });
  });

  describe("Ley 2300 de 2023 ('Dejen de Fregar') — Gatekeeper de Cobranza", () => {
    let customerId: string;

    beforeEach(() => {
      const c = service.upsertCustomerWithOptionalInitialBalance({
        tenantId,
        fullName: "Julián Morales",
        creditEnabled: true,
        creditLimitCents: 500_000,
        initialBalanceCents: 120_000,
        preferredChannels: ["WHATSAPP", "SMS"]
      });
      customerId = c.id;
    });

    it("permite contacto en días hábiles dentro del horario legal (L-V 7:00 a 19:00)", () => {
      // Martes a las 10:30 AM Colombia (15:30 UTC)
      const martes10am = new Date("2026-05-05T15:30:00Z").getTime();
      const val = service.validateCollectionContactAllowed({
        tenantId,
        customerId,
        channel: "WHATSAPP",
        targetIsDebtorOrCodebtor: true,
        nowMs: martes10am
      });
      expect(val.allowed).toBe(true);
      expect(val.code).toBe("ALLOWED");
    });

    it("bloquea contacto de Lunes a Viernes antes de 7:00 AM o después de 7:00 PM", () => {
      // Martes 6:55 AM Colombia (11:55 UTC) -> Muy temprano
      const temprano = new Date("2026-05-05T11:55:00Z").getTime();
      const valTemprano = service.validateCollectionContactAllowed({
        tenantId,
        customerId,
        channel: "SMS",
        targetIsDebtorOrCodebtor: true,
        nowMs: temprano
      });
      expect(valTemprano.allowed).toBe(false);
      expect(valTemprano.code).toBe("OUTSIDE_HOURS");
      expect(valTemprano.reason).toContain("07:00 a 19:00");

      // Martes 7:05 PM Colombia (00:05 UTC del miércoles) -> Muy tarde
      const tarde = new Date("2026-05-06T00:05:00Z").getTime();
      const valTarde = service.validateCollectionContactAllowed({
        tenantId,
        customerId,
        channel: "SMS",
        targetIsDebtorOrCodebtor: true,
        nowMs: tarde
      });
      expect(valTarde.allowed).toBe(false);
      expect(valTarde.code).toBe("OUTSIDE_HOURS");
    });

    it("valida el horario específico de los Sábados (8:00 AM a 3:00 PM)", () => {
      // Sábado 9 Mayo 2026 10:00 AM Colombia (15:00 UTC) -> Permitido
      const sabado10am = new Date("2026-05-09T15:00:00Z").getTime();
      const valOk = service.validateCollectionContactAllowed({
        tenantId,
        customerId,
        channel: "SMS",
        targetIsDebtorOrCodebtor: true,
        nowMs: sabado10am
      });
      expect(valOk.allowed).toBe(true);

      // Sábado 9 Mayo 2026 3:15 PM Colombia (20:15 UTC) -> Bloqueado
      const sabado315pm = new Date("2026-05-09T20:15:00Z").getTime();
      const valTarde = service.validateCollectionContactAllowed({
        tenantId,
        customerId,
        channel: "SMS",
        targetIsDebtorOrCodebtor: true,
        nowMs: sabado315pm
      });
      expect(valTarde.allowed).toBe(false);
      expect(valTarde.code).toBe("OUTSIDE_HOURS");
      expect(valTarde.reason).toContain("08:00 a 15:00");
    });

    it("prohíbe taxativamente contactos de cobranza los Domingos y Festivos", () => {
      // Domingo 10 Mayo 2026 10:00 AM Colombia
      const domingo = new Date("2026-05-10T15:00:00Z").getTime();
      const valDom = service.validateCollectionContactAllowed({
        tenantId,
        customerId,
        channel: "WHATSAPP",
        targetIsDebtorOrCodebtor: true,
        nowMs: domingo
      });
      expect(valDom.allowed).toBe(false);
      expect(valDom.code).toBe("SUNDAY_PROHIBITED");

      // Festivo Lunes 18 Mayo 2026 (Ascensión del Señor) 10:00 AM Colombia
      const festivo = new Date("2026-05-18T15:00:00Z").getTime();
      const valFestivo = service.validateCollectionContactAllowed({
        tenantId,
        customerId,
        channel: "WHATSAPP",
        targetIsDebtorOrCodebtor: true,
        nowMs: festivo
      });
      expect(valFestivo.allowed).toBe(false);
      expect(valFestivo.code).toBe("HOLIDAY_PROHIBITED");
      expect(valFestivo.reason).toContain("Ascensión del Señor");
    });

    it("bloquea contacto a terceros no avalistas (referencias, familiares, vecinos)", () => {
      const martes10am = new Date("2026-05-05T15:30:00Z").getTime();
      const valTercero = service.validateCollectionContactAllowed({
        tenantId,
        customerId,
        channel: "CALL",
        targetIsDebtorOrCodebtor: false, // Tercero no avalista
        nowMs: martes10am
      });
      expect(valTercero.allowed).toBe(false);
      expect(valTercero.code).toBe("UNAUTHORIZED_THIRD_PARTY");
    });

    it("bloquea cobranza a clientes sin deuda activa (balance_cents = 0)", () => {
      const custSinDeuda = service.upsertCustomerWithOptionalInitialBalance({
        tenantId,
        fullName: "Beatriz Al Día",
        creditEnabled: true,
        creditLimitCents: 200_000,
        initialBalanceCents: 0
      });

      const martes10am = new Date("2026-05-05T15:30:00Z").getTime();
      const val = service.validateCollectionContactAllowed({
        tenantId,
        customerId: custSinDeuda.id,
        channel: "WHATSAPP",
        targetIsDebtorOrCodebtor: true,
        nowMs: martes10am
      });
      expect(val.allowed).toBe(false);
      expect(val.code).toBe("NO_ACTIVE_DEBT");
    });

    it("restringe el contacto a los canales expresamente autorizados por el deudor", () => {
      // Cliente tiene autorizados exclusivamente WHATSAPP y SMS
      const martes10am = new Date("2026-05-05T15:30:00Z").getTime();
      const valLlamada = service.validateCollectionContactAllowed({
        tenantId,
        customerId,
        channel: "CALL", // No está en preferredChannels
        targetIsDebtorOrCodebtor: true,
        nowMs: martes10am
      });
      expect(valLlamada.allowed).toBe(false);
      expect(valLlamada.code).toBe("UNPREFERRED_CHANNEL");
      expect(valLlamada.reason).toContain("WHATSAPP, SMS");
    });

    it("limita taxativamente a máximo 2 contactos por semana calendario auditando el registro para la SIC", () => {
      const martes10am = new Date("2026-05-05T15:30:00Z").getTime();
      const jueves2pm = new Date("2026-05-07T19:00:00Z").getTime();
      const viernes11am = new Date("2026-05-08T16:00:00Z").getTime();

      // 1er contacto en la semana (Martes) -> OK
      const c1 = service.recordCollectionContact({
        tenantId,
        customerId,
        channel: "WHATSAPP",
        targetIsDebtorOrCodebtor: true,
        agentOrSystemId: "bot-cartera-01",
        notes: "Recordatorio amigable de saldo pendiente",
        nowMs: martes10am
      });
      expect(c1.success).toBe(true);
      expect(c1.contactId).toBeDefined();
      expect(service.getWeeklyContactCount(tenantId, customerId, martes10am)).toBe(1);

      // 2do contacto en la semana (Jueves) -> OK
      const c2 = service.recordCollectionContact({
        tenantId,
        customerId,
        channel: "SMS",
        targetIsDebtorOrCodebtor: true,
        agentOrSystemId: "bot-cartera-01",
        notes: "Recordatorio segundo contacto",
        nowMs: jueves2pm
      });
      expect(c2.success).toBe(true);
      expect(service.getWeeklyContactCount(tenantId, customerId, jueves2pm)).toBe(2);

      // 3er contacto en la misma semana (Viernes) -> BLOQUEADO por Ley 2300
      const c3 = service.recordCollectionContact({
        tenantId,
        customerId,
        channel: "WHATSAPP",
        targetIsDebtorOrCodebtor: true,
        agentOrSystemId: "bot-cartera-01",
        notes: "Tercer intento no autorizado",
        nowMs: viernes11am
      });
      expect(c3.success).toBe(false);
      expect(c3.rejectedCode).toBe("WEEKLY_LIMIT_REACHED");
      expect(c3.rejectionReason).toContain("máximo 2 por semana");

      // Verificación de auditoría legal completa
      const auditLog = service.getCustomerContactAuditLog(tenantId, customerId);
      expect(auditLog).toHaveLength(3);
      expect(auditLog.filter((a) => a.status === "ALLOWED")).toHaveLength(2);
      expect(auditLog.filter((a) => a.status === "REJECTED")).toHaveLength(1);
      expect(auditLog[2]?.status).toBe("REJECTED");
      expect(auditLog[2]?.rejection_reason).toContain("WEEKLY_LIMIT_REACHED");

      // La siguiente semana (Lunes 11 Mayo) el contador se reinicia a 0
      const siguienteLunes10am = new Date("2026-05-11T15:00:00Z").getTime();
      expect(service.getWeeklyContactCount(tenantId, customerId, siguienteLunes10am)).toBe(0);

      // Primer contacto de la nueva semana -> Permitido
      const cNuevaSemana = service.recordCollectionContact({
        tenantId,
        customerId,
        channel: "WHATSAPP",
        targetIsDebtorOrCodebtor: true,
        agentOrSystemId: "bot-cartera-01",
        nowMs: siguienteLunes10am
      });
      expect(cNuevaSemana.success).toBe(true);
    });
  });
});
