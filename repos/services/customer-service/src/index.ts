import { newId } from "@tiendita/contracts";

/**
 * ÉPICA 09 (FT-09.4) — customer-service: Cartera Consolidada, Cupo ALLOCATED, Castigos,
 * Derechos ARCO (Ley 1581 de 2012) y Política de Contacto de Cobranza (Ley 2300 de 2023 "Dejen de Fregar").
 * Cubre: HU-093, HU-094, HU-305, HU-363, HU-398, HU-399, HU-446.
 */

export interface CloudCustomerRecord {
  id: string;
  tenant_id: string;
  full_name: string;
  alias: string | null;
  doc_type: string | null;
  doc_number: string | null;
  phone: string | null;
  credit_enabled: boolean;
  credit_limit_cents: number;
  balance_cents: number;
  data_consent_at_iso: string;
  anonymized: boolean;
  preferred_channels?: Array<"SMS" | "WHATSAPP" | "CALL" | "EMAIL"> | null;
}

export interface CloudCreditMovementRecord {
  id: string;
  tenant_id: string;
  customer_id: string;
  kind: "INITIAL_BALANCE" | "CHARGE" | "PAYMENT" | "WRITE_OFF" | "RETURN_CREDIT";
  delta_cents: number; // positivo = sube deuda, negativo = baja deuda
  reason: string | null;
  occurred_at_ms: number;
}

export interface CollectionContactLogRecord {
  id: string;
  tenant_id: string;
  customer_id: string;
  channel: "SMS" | "WHATSAPP" | "CALL" | "EMAIL";
  occurred_at_ms: number;
  agent_or_system_id: string;
  status: "ALLOWED" | "REJECTED";
  rejection_reason?: string;
  notes?: string;
}

export interface ColombianDateComponents {
  year: number;
  month: number;
  day: number;
  dayOfWeek: number; // 0=Sunday, 1=Monday, ..., 6=Saturday
  hour: number;
  minute: number;
  second: number;
  dateStr: string;
}

/**
 * Convierte cualquier timestamp UTC a componentes de fecha y hora local en Colombia (UTC-5 sin horario de verano).
 */
export function getColombiaDateComponents(tsMs: number): ColombianDateComponents {
  const COLOMBIA_OFFSET_MS = -5 * 60 * 60 * 1000;
  const colDate = new Date(tsMs + COLOMBIA_OFFSET_MS);
  const year = colDate.getUTCFullYear();
  const month = colDate.getUTCMonth() + 1;
  const day = colDate.getUTCDate();
  const dayOfWeek = colDate.getUTCDay();
  const hour = colDate.getUTCHours();
  const minute = colDate.getUTCMinutes();
  const second = colDate.getUTCSeconds();
  const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return { year, month, day, dayOfWeek, hour, minute, second, dateStr };
}

/**
 * Algoritmo anónimo/Butcher para calcular Domingo de Resurrección (Pascua) en el calendario gregoriano.
 */
export function computeEasterSunday(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

function getEmilianiMonday(year: number, month: number, day: number): string {
  const dt = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const dow = dt.getUTCDay();
  if (dow === 1) {
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  const daysToAdd = dow === 0 ? 1 : 8 - dow;
  const nextMonday = new Date(dt.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
  const m = nextMonday.getUTCMonth() + 1;
  const d = nextMonday.getUTCDate();
  return `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function formatOffsetDate(year: number, month: number, day: number, offsetDays: number): string {
  const dt = new Date(Date.UTC(year, month - 1, day + offsetDays, 12, 0, 0));
  const m = dt.getUTCMonth() + 1;
  const d = dt.getUTCDate();
  return `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Retorna todos los días festivos de Colombia para un año específico (Ley 51 de 1983 - Ley Emiliani).
 */
export function getColombianHolidays(year: number): Map<string, string> {
  const holidays = new Map<string, string>();

  // 1. Días festivos de fecha fija
  holidays.set(`${year}-01-01`, "Año Nuevo");
  holidays.set(`${year}-05-01`, "Día del Trabajo");
  holidays.set(`${year}-07-20`, "Día de la Independencia");
  holidays.set(`${year}-08-07`, "Batalla de Boyacá");
  holidays.set(`${year}-12-08`, "Inmaculada Concepción");
  holidays.set(`${year}-12-25`, "Navidad");

  // 2. Pascua / Semana Santa
  const easter = computeEasterSunday(year);
  const juevesSanto = formatOffsetDate(year, easter.month, easter.day, -3);
  const viernesSanto = formatOffsetDate(year, easter.month, easter.day, -2);
  holidays.set(juevesSanto, "Jueves Santo");
  holidays.set(viernesSanto, "Viernes Santo");

  // 3. Festivos trasladados al lunes siguiente (Ley 51 de 1983 - Ley Emiliani)
  holidays.set(getEmilianiMonday(year, 1, 6), "Reyes Magos (Epifanía)");
  holidays.set(getEmilianiMonday(year, 3, 19), "Día de San José");
  holidays.set(getEmilianiMonday(year, 6, 29), "San Pedro y San Pablo");
  holidays.set(getEmilianiMonday(year, 8, 15), "Asunción de la Virgen");
  holidays.set(getEmilianiMonday(year, 10, 12), "Día de la Raza");
  holidays.set(getEmilianiMonday(year, 11, 1), "Todos los Santos");
  holidays.set(getEmilianiMonday(year, 11, 11), "Independencia de Cartagena");

  // 4. Festivos relativos a Pascua trasladados al lunes
  holidays.set(formatOffsetDate(year, easter.month, easter.day, 43), "Ascensión del Señor");
  holidays.set(formatOffsetDate(year, easter.month, easter.day, 64), "Corpus Christi");
  holidays.set(formatOffsetDate(year, easter.month, easter.day, 71), "Sagrado Corazón de Jesús");

  return holidays;
}

/**
 * Dictamina si un instante corresponde a un domingo o día festivo en Colombia.
 */
export function isColombianHolidayOrRestDay(tsMs: number): {
  isRestDay: boolean;
  isSunday: boolean;
  isHoliday: boolean;
  holidayName?: string;
  dayOfWeek: number;
} {
  const comp = getColombiaDateComponents(tsMs);
  const isSunday = comp.dayOfWeek === 0;
  const holidays = getColombianHolidays(comp.year);
  const holidayName = holidays.get(comp.dateStr);
  const isHoliday = holidayName !== undefined;
  return {
    isRestDay: isSunday || isHoliday,
    isSunday,
    isHoliday,
    holidayName,
    dayOfWeek: comp.dayOfWeek
  };
}

export class CustomerService {
  private readonly inboxProcessed = new Set<string>();
  public readonly tenantMaxCreditCustomers = new Map<string, number>();
  public readonly customers = new Map<string, CloudCustomerRecord>();
  public readonly movements: CloudCreditMovementRecord[] = [];
  public readonly publishedEvents: { topic: string; payload: unknown }[] = [];
  public readonly contactHistory: CollectionContactLogRecord[] = [];

  /**
   * HU-398 & HU-446: Creación de cliente o importación desde el cuaderno de fiados (`INITIAL_BALANCE`),
   * deduplicando por documento y validando `max_credit_customers` al activar `credit_enabled = true`.
   */
  upsertCustomerWithOptionalInitialBalance(params: {
    tenantId: string;
    fullName: string;
    alias?: string;
    docType?: string;
    docNumber?: string;
    phone?: string;
    creditEnabled: boolean;
    creditLimitCents: number;
    initialBalanceCents?: number;
    preferredChannels?: Array<"SMS" | "WHATSAPP" | "CALL" | "EMAIL">;
    nowMs?: number;
  }): CloudCustomerRecord {
    const nowMs = params.nowMs ?? Date.now();

    // Deduplicación por documento dentro del mismo tenant (HU-093)
    if (params.docType && params.docNumber) {
      const existing = [...this.customers.values()].find(
        (c) =>
          c.tenant_id === params.tenantId &&
          c.doc_type === params.docType &&
          c.doc_number === params.docNumber &&
          !c.anonymized
      );
      if (existing) {
        return existing;
      }
    }

    if (params.creditEnabled) {
      const maxCredit = this.tenantMaxCreditCustomers.get(params.tenantId) ?? 50;
      const currentCreditEnabledCount = [...this.customers.values()].filter(
        (c) => c.tenant_id === params.tenantId && c.credit_enabled && !c.anonymized
      ).length;
      if (currentCreditEnabledCount >= maxCredit) {
        throw new Error("403 CREDIT_CUSTOMERS_LIMIT_REACHED");
      }
    }

    const cust: CloudCustomerRecord = {
      id: newId(nowMs),
      tenant_id: params.tenantId,
      full_name: params.fullName,
      alias: params.alias ?? null,
      doc_type: params.docType ?? null,
      doc_number: params.docNumber ?? null,
      phone: params.phone ?? null,
      credit_enabled: params.creditEnabled,
      credit_limit_cents: params.creditLimitCents,
      balance_cents: 0,
      data_consent_at_iso: new Date(nowMs).toISOString(),
      anonymized: false,
      preferred_channels: params.preferredChannels ?? null
    };
    this.customers.set(cust.id, cust);

    if (params.initialBalanceCents && params.initialBalanceCents > 0) {
      cust.balance_cents += params.initialBalanceCents;
      this.movements.push({
        id: newId(nowMs),
        tenant_id: params.tenantId,
        customer_id: cust.id,
        kind: "INITIAL_BALANCE",
        delta_cents: params.initialBalanceCents,
        reason: "Saldo inicial cuaderno de fiados",
        occurred_at_ms: nowMs
      });
    }

    return cust;
  }

  /**
   * HU-093 (E07): Suma conmutativa de cargos/abonos de cartera desde múltiples cajas offline,
   * emitiendo `customer.credit_limit_exceeded` si el saldo consolidado supera `credit_limit_cents`.
   */
  applyCreditMovementEvent(params: {
    eventId: string;
    tenantId: string;
    customerId: string;
    kind: "CHARGE" | "PAYMENT" | "RETURN_CREDIT";
    deltaCents: number;
    occurredAtMs: number;
  }): { deduplicated: boolean; newBalanceCents: number; limitExceededEmitted: boolean } {
    const cust = this.customers.get(params.customerId);
    if (!cust || cust.tenant_id !== params.tenantId) {
      throw new Error("CUSTOMER_NOT_FOUND");
    }
    if (this.inboxProcessed.has(params.eventId)) {
      return {
        deduplicated: true,
        newBalanceCents: cust.balance_cents,
        limitExceededEmitted: false
      };
    }

    this.inboxProcessed.add(params.eventId);
    cust.balance_cents += params.deltaCents;
    this.movements.push({
      id: newId(params.occurredAtMs),
      tenant_id: params.tenantId,
      customer_id: cust.id,
      kind: params.kind,
      delta_cents: params.deltaCents,
      reason: null,
      occurred_at_ms: params.occurredAtMs
    });

    const limitExceeded =
      params.deltaCents > 0 && cust.balance_cents > cust.credit_limit_cents;
    if (limitExceeded) {
      this.publishedEvents.push({
        topic: "customer.events",
        payload: {
          type: "customer.credit_limit_exceeded",
          data: {
            tenant_id: params.tenantId,
            customer_id: cust.id,
            balance_cents: cust.balance_cents,
            credit_limit_cents: cust.credit_limit_cents
          }
        }
      });
    }

    return {
      deduplicated: false,
      newBalanceCents: cust.balance_cents,
      limitExceededEmitted: limitExceeded
    };
  }

  /**
   * HU-305: Modo `ALLOCATED`: divide el cupo disponible del cliente equitativamente entre las cajas activas de la tienda.
   */
  computeAllocatedCreditPerTerminalCents(customerId: string, activeTerminalsCount: number): number {
    const cust = this.customers.get(customerId);
    if (!cust || !cust.credit_enabled || activeTerminalsCount <= 0) return 0;
    const available = Math.max(0, cust.credit_limit_cents - cust.balance_cents);
    return Math.floor(available / activeTerminalsCount);
  }

  /**
   * HU-094 & HU-399: Castigo de cartera incobrable (`WRITE_OFF`) dejando el saldo en $0 y auditando el motivo.
   */
  writeOffCustomerDebt(params: {
    tenantId: string;
    customerId: string;
    reason: string;
    mfaVerified: boolean;
    nowMs?: number;
  }): CloudCustomerRecord {
    if (!params.mfaVerified) {
      throw new Error("403 STEP_UP_MFA_REQUIRED");
    }
    const cust = this.customers.get(params.customerId);
    if (!cust || cust.tenant_id !== params.tenantId) {
      throw new Error("CUSTOMER_NOT_FOUND");
    }
    if (cust.balance_cents > 0) {
      const writeOffAmount = cust.balance_cents;
      cust.balance_cents = 0;
      this.movements.push({
        id: newId(params.nowMs),
        tenant_id: params.tenantId,
        customer_id: cust.id,
        kind: "WRITE_OFF",
        delta_cents: -writeOffAmount,
        reason: params.reason,
        occurred_at_ms: params.nowMs ?? Date.now()
      });
    }
    return cust;
  }

  /**
   * HU-094 & HU-363: Derechos ARCO (Ley 1581 de 2012) — Exportación de ficha personal y supresión/anonimización
   * bloqueando la supresión si existe deuda pendiente (`balance_cents > 0`).
   */
  exportArcoPersonalDataPackage(tenantId: string, customerId: string): Record<string, unknown> {
    const cust = this.customers.get(customerId);
    if (!cust || cust.tenant_id !== tenantId) throw new Error("CUSTOMER_NOT_FOUND");
    return {
      customer_id: cust.id,
      full_name: cust.full_name,
      doc_type: cust.doc_type,
      doc_number: cust.doc_number,
      phone: cust.phone,
      data_consent_at: cust.data_consent_at_iso,
      balance_cents: cust.balance_cents
    };
  }

  suppressCustomerPersonalData(tenantId: string, customerId: string): CloudCustomerRecord {
    const cust = this.customers.get(customerId);
    if (!cust || cust.tenant_id !== tenantId) throw new Error("CUSTOMER_NOT_FOUND");
    if (cust.balance_cents > 0) {
      throw new Error("409 CANNOT_SUPPRESS_DATA_WITH_ACTIVE_DEBT");
    }
    cust.full_name = `TITULAR ANONIMIZADO ${cust.id.slice(0, 6)}`;
    cust.alias = null;
    cust.doc_number = null;
    cust.phone = null;
    cust.credit_enabled = false;
    cust.anonymized = true;
    return cust;
  }

  /**
   * LEY 2300 DE 2023 ("DEJEN DE FREGAR"):
   * Valida taxativamente si un contacto de cobranza o recordatorio de pago está permitido por la ley.
   * Reglas:
   * 1. Solo al deudor o deudor solidario/avalista (nunca a referencias ni terceros).
   * 2. Lunes a Viernes: 7:00 AM a 7:00 PM.
   * 3. Sábados: 8:00 AM a 3:00 PM.
   * 4. Domingos y Días Festivos en Colombia: Prohibido 24/7.
   * 5. Frecuencia: Máximo 2 contactos por semana calendario (Lunes a Domingo).
   * 6. Deudor debe tener cartera en mora (balance_cents > 0).
   * 7. Respetar canal preferido del cliente si lo ha establecido.
   */
  validateCollectionContactAllowed(params: {
    tenantId: string;
    customerId: string;
    channel: "SMS" | "WHATSAPP" | "CALL" | "EMAIL";
    targetIsDebtorOrCodebtor: boolean;
    nowMs?: number;
  }): {
    allowed: boolean;
    code:
      | "ALLOWED"
      | "OUTSIDE_HOURS"
      | "SUNDAY_PROHIBITED"
      | "HOLIDAY_PROHIBITED"
      | "WEEKLY_LIMIT_REACHED"
      | "CUSTOMER_NOT_FOUND"
      | "NO_ACTIVE_DEBT"
      | "UNAUTHORIZED_THIRD_PARTY"
      | "UNPREFERRED_CHANNEL";
    reason: string;
    details?: Record<string, unknown>;
  } {
    const nowMs = params.nowMs ?? Date.now();
    const cust = this.customers.get(params.customerId);
    if (!cust || cust.tenant_id !== params.tenantId) {
      return {
        allowed: false,
        code: "CUSTOMER_NOT_FOUND",
        reason: "Cliente no encontrado en el sistema"
      };
    }

    if (cust.balance_cents <= 0) {
      return {
        allowed: false,
        code: "NO_ACTIVE_DEBT",
        reason: "El cliente no tiene deuda activa ni cartera en mora pendiente de recaudo"
      };
    }

    // Ley 2300: Solo contactar al deudor o deudor solidario/avalista
    if (!params.targetIsDebtorOrCodebtor) {
      return {
        allowed: false,
        code: "UNAUTHORIZED_THIRD_PARTY",
        reason: "Ley 2300 de 2023 prohíbe contactar a referencias o terceros no avalistas para cobro de cartera"
      };
    }

    // Canal preferido
    if (cust.preferred_channels && cust.preferred_channels.length > 0) {
      if (!cust.preferred_channels.includes(params.channel)) {
        return {
          allowed: false,
          code: "UNPREFERRED_CHANNEL",
          reason: `El cliente ha restringido sus canales de contacto a: ${cust.preferred_channels.join(", ")}`,
          details: { preferred: cust.preferred_channels, attempted: params.channel }
        };
      }
    }

    // Validación de día y hora Colombia
    const dateComp = getColombiaDateComponents(nowMs);
    const restDayCheck = isColombianHolidayOrRestDay(nowMs);

    if (restDayCheck.isSunday) {
      return {
        allowed: false,
        code: "SUNDAY_PROHIBITED",
        reason: "Ley 2300 de 2023 prohíbe taxativamente la cobranza los domingos",
        details: { date: dateComp.dateStr, dayOfWeek: "DOMINGO" }
      };
    }

    if (restDayCheck.isHoliday) {
      return {
        allowed: false,
        code: "HOLIDAY_PROHIBITED",
        reason: `Ley 2300 de 2023 prohíbe el contacto de cobranza en días festivos (${restDayCheck.holidayName})`,
        details: { date: dateComp.dateStr, festivo: restDayCheck.holidayName }
      };
    }

    // Horarios hábiles
    if (dateComp.dayOfWeek >= 1 && dateComp.dayOfWeek <= 5) {
      // Lunes a Viernes: 7:00 AM (07:00) a 7:00 PM (19:00)
      if (dateComp.hour < 7 || dateComp.hour >= 19) {
        return {
          allowed: false,
          code: "OUTSIDE_HOURS",
          reason: `Horario no permitido de lunes a viernes (hora actual Colombia: ${dateComp.hour}:${String(dateComp.minute).padStart(2, "0")}. Permitido: 07:00 a 19:00)`,
          details: { hour: dateComp.hour, minute: dateComp.minute }
        };
      }
    } else if (dateComp.dayOfWeek === 6) {
      // Sábado: 8:00 AM (08:00) a 3:00 PM (15:00)
      if (dateComp.hour < 8 || dateComp.hour >= 15) {
        return {
          allowed: false,
          code: "OUTSIDE_HOURS",
          reason: `Horario no permitido los sábados (hora actual Colombia: ${dateComp.hour}:${String(dateComp.minute).padStart(2, "0")}. Permitido: 08:00 a 15:00)`,
          details: { hour: dateComp.hour, minute: dateComp.minute }
        };
      }
    }

    // Límite semanal de 2 contactos
    const weeklyCount = this.getWeeklyContactCount(params.tenantId, params.customerId, nowMs);
    if (weeklyCount >= 2) {
      return {
        allowed: false,
        code: "WEEKLY_LIMIT_REACHED",
        reason: `Ley 2300 de 2023 limita los contactos de cobranza a máximo 2 por semana calendario (contactos realizados en la semana: ${weeklyCount})`,
        details: { weeklyCount, maxAllowed: 2 }
      };
    }

    return {
      allowed: true,
      code: "ALLOWED",
      reason: "Contacto autorizado según los términos de la Ley 2300 de 2023 y Ley 1581 de 2012"
    };
  }

  /**
   * Registra y audita un intento de contacto de cobranza bajo Ley 2300.
   */
  recordCollectionContact(params: {
    tenantId: string;
    customerId: string;
    channel: "SMS" | "WHATSAPP" | "CALL" | "EMAIL";
    targetIsDebtorOrCodebtor: boolean;
    agentOrSystemId: string;
    notes?: string;
    nowMs?: number;
  }): {
    success: boolean;
    contactId?: string;
    rejectedCode?: string;
    rejectionReason?: string;
  } {
    const nowMs = params.nowMs ?? Date.now();
    const val = this.validateCollectionContactAllowed(params);

    if (!val.allowed) {
      const record: CollectionContactLogRecord = {
        id: newId(nowMs),
        tenant_id: params.tenantId,
        customer_id: params.customerId,
        channel: params.channel,
        occurred_at_ms: nowMs,
        agent_or_system_id: params.agentOrSystemId,
        status: "REJECTED",
        rejection_reason: `${val.code}: ${val.reason}`,
        notes: params.notes
      };
      this.contactHistory.push(record);
      return {
        success: false,
        rejectedCode: val.code,
        rejectionReason: val.reason
      };
    }

    const contactId = newId(nowMs);
    const record: CollectionContactLogRecord = {
      id: contactId,
      tenant_id: params.tenantId,
      customer_id: params.customerId,
      channel: params.channel,
      occurred_at_ms: nowMs,
      agent_or_system_id: params.agentOrSystemId,
      status: "ALLOWED",
      notes: params.notes
    };
    this.contactHistory.push(record);
    return {
      success: true,
      contactId
    };
  }

  /**
   * Cuenta cuántos contactos exitosos ha recibido el cliente en la semana calendario actual (Lunes a Domingo en hora Colombia).
   */
  getWeeklyContactCount(tenantId: string, customerId: string, nowMs = Date.now()): number {
    const comp = getColombiaDateComponents(nowMs);
    const daysSinceMonday = (comp.dayOfWeek + 6) % 7;
    const todayMidnightUtcMs = Date.UTC(comp.year, comp.month - 1, comp.day, 5, 0, 0);
    const mondayMidnightUtcMs = todayMidnightUtcMs - daysSinceMonday * 24 * 60 * 60 * 1000;
    const nextMondayMidnightUtcMs = mondayMidnightUtcMs + 7 * 24 * 60 * 60 * 1000;

    return this.contactHistory.filter(
      (c) =>
        c.tenant_id === tenantId &&
        c.customer_id === customerId &&
        c.status === "ALLOWED" &&
        c.occurred_at_ms >= mondayMidnightUtcMs &&
        c.occurred_at_ms < nextMondayMidnightUtcMs
    ).length;
  }

  /**
   * Retorna el historial completo de contactos para auditoría regulatoria (SIC).
   */
  getCustomerContactAuditLog(tenantId: string, customerId: string): CollectionContactLogRecord[] {
    return this.contactHistory.filter((c) => c.tenant_id === tenantId && c.customer_id === customerId);
  }
}
