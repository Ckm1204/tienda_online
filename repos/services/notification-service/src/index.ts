import { newId } from "@tiendita/contracts";
import { CircuitBreaker, CircuitOpenError, ServiceLifecycleManager } from "@tiendita/service-kit";

export const serviceName = "notification-service";
export const lifecycle = new ServiceLifecycleManager();

/**
 * ============================================================================
 * ÉPICA 11 (FT-11.2) — notification-service: Notificaciones Multicanal y Ley 2300
 * Cubre:
 *  - HU-108: Motor multicanal con deduplicación (`dedupe_key`), plantillas y push_devices
 *  - HU-109 & HU-364: Horarios legales y límite de 2 contactos semanales (Ley 2300 de 2023)
 *  - HU-197: Preferencias por usuario y canal (Push, WhatsApp, Correo, SMS)
 *  - HU-306: Adaptadores con Circuit Breakers y canal de respaldo
 *  - HU-327: Envío digital de comprobante de venta por WhatsApp o correo
 * ============================================================================
 */

export type NotificationChannel = "EMAIL" | "SMS" | "WHATSAPP" | "PUSH" | "IN_APP";
export type NotificationStatus = "QUEUED" | "SENT" | "DELIVERED" | "READ" | "FAILED";

export interface NotificationTemplate {
  code: string;
  channel: NotificationChannel;
  locale: string;
  subject?: string;
  body: string;
}

export interface PushDeviceRecord {
  id: string;
  tenantId: string;
  userId: string;
  platform: "IOS" | "ANDROID" | "WEB";
  token: string;
  lastSeenAtMs: number;
  revokedAtMs: number | null;
}

export interface UserNotificationPreferences {
  tenantId: string;
  userId: string;
  topic: string; // "cash.discrepancy" | "stock.negative" | "billing" | "debt_reminder"
  channels: NotificationChannel[];
}

export interface NotificationRecord {
  id: string;
  tenantId: string | null;
  userId: string | null;
  recipient: string;
  channel: NotificationChannel;
  templateCode: string;
  payload: Record<string, unknown>;
  dedupeKey: string;
  status: NotificationStatus;
  provider: string;
  scheduledForMs: number;
  sentAtMs: number | null;
  error?: string;
  isDebtCollection?: boolean;
  renderedSubject?: string;
  renderedBody?: string;
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

export function getColombianHolidays(year: number): Map<string, string> {
  const holidays = new Map<string, string>();
  holidays.set(`${year}-01-01`, "Año Nuevo");
  holidays.set(`${year}-05-01`, "Día del Trabajo");
  holidays.set(`${year}-07-20`, "Día de la Independencia");
  holidays.set(`${year}-08-07`, "Batalla de Boyacá");
  holidays.set(`${year}-12-08`, "Inmaculada Concepción");
  holidays.set(`${year}-12-25`, "Navidad");

  const easter = computeEasterSunday(year);
  const juevesSanto = formatOffsetDate(year, easter.month, easter.day, -3);
  const viernesSanto = formatOffsetDate(year, easter.month, easter.day, -2);
  holidays.set(juevesSanto, "Jueves Santo");
  holidays.set(viernesSanto, "Viernes Santo");

  holidays.set(getEmilianiMonday(year, 1, 6), "Reyes Magos (Epifanía)");
  holidays.set(getEmilianiMonday(year, 3, 19), "Día de San José");
  holidays.set(getEmilianiMonday(year, 6, 29), "San Pedro y San Pablo");
  holidays.set(getEmilianiMonday(year, 8, 15), "Asunción de la Virgen");
  holidays.set(getEmilianiMonday(year, 10, 12), "Día de la Raza");
  holidays.set(getEmilianiMonday(year, 11, 1), "Todos los Santos");
  holidays.set(getEmilianiMonday(year, 11, 11), "Independencia de Cartagena");

  holidays.set(formatOffsetDate(year, easter.month, easter.day, 43), "Ascensión del Señor");
  holidays.set(formatOffsetDate(year, easter.month, easter.day, 64), "Corpus Christi");
  holidays.set(formatOffsetDate(year, easter.month, easter.day, 71), "Sagrado Corazón de Jesús");

  return holidays;
}

/**
 * HU-109 & HU-364: Verificador de Cumplimiento de la Ley 2300 de 2023 ("Dejen de fregar")
 * Reglas:
 * 1. Lunes a Viernes: 07:00 a 19:00 (hora local Colombia UTC-5)
 * 2. Sábados: 08:00 a 15:00 (hora local Colombia UTC-5)
 * 3. Domingos y días festivos en Colombia: PROHIBIDO TODO CONTACTO DE COBRANZA
 * 4. Máximo 2 contactos de cobranza por semana por deudor
 */
export class Ley2300ComplianceEngine {
  // Contador auditable de contactos semanales por deudor (HU-364)
  public readonly weeklyContactCounters = new Map<string, number>();

  isLegalContactTime(timestampMs: number): boolean {
    const comp = getColombiaDateComponents(timestampMs);

    // Domingos prohibidos 24/7
    if (comp.dayOfWeek === 0) {
      return false;
    }

    // Días festivos oficiales en Colombia prohibidos 24/7 (Ley 51 de 1983)
    const holidays = getColombianHolidays(comp.year);
    if (holidays.has(comp.dateStr)) {
      return false;
    }

    // Lunes a Viernes: 07:00 a 19:00 hora Colombia
    if (comp.dayOfWeek >= 1 && comp.dayOfWeek <= 5) {
      return comp.hour >= 7 && comp.hour < 19;
    }

    // Sábados: 08:00 a 15:00 hora Colombia
    if (comp.dayOfWeek === 6) {
      return comp.hour >= 8 && comp.hour < 15;
    }

    return false;
  }

  canContactDebtorThisWeek(debtorId: string, timestampMs: number): boolean {
    const weekKey = this.getYearWeekKey(timestampMs);
    const counterKey = `${debtorId}:${weekKey}`;
    const count = this.weeklyContactCounters.get(counterKey) || 0;
    return count < 2; // Máximo 2 contactos semanales permitidos
  }

  recordContact(debtorId: string, timestampMs: number): void {
    const weekKey = this.getYearWeekKey(timestampMs);
    const counterKey = `${debtorId}:${weekKey}`;
    const count = this.weeklyContactCounters.get(counterKey) || 0;
    this.weeklyContactCounters.set(counterKey, count + 1);
  }

  computeNextLegalContactTime(timestampMs: number): number {
    let cursorMs = timestampMs + 60_000;
    while (!this.isLegalContactTime(cursorMs)) {
      // Avanzar en intervalos de 30 minutos hasta encontrar ventana hábil
      cursorMs += 30 * 60_000;
    }
    return cursorMs;
  }

  private getYearWeekKey(timestampMs: number): string {
    const comp = getColombiaDateComponents(timestampMs);
    const daysSinceMonday = (comp.dayOfWeek + 6) % 7;
    const todayMidnightUtcMs = Date.UTC(comp.year, comp.month - 1, comp.day, 5, 0, 0);
    const mondayMidnightUtcMs = todayMidnightUtcMs - daysSinceMonday * 24 * 60 * 60 * 1000;
    return `${comp.year}-W${Math.floor(mondayMidnightUtcMs / (7 * 24 * 60 * 60 * 1000))}`;
  }
}

export class NotificationService {
  public readonly templates = new Map<string, NotificationTemplate>();
  public readonly pushDevices = new Map<string, PushDeviceRecord>();
  public readonly preferences = new Map<string, UserNotificationPreferences>();
  public readonly notifications = new Map<string, NotificationRecord>();
  public readonly dedupeStore = new Map<string, string>(); // dedupeKey -> notificationId

  public readonly ley2300 = new Ley2300ComplianceEngine();

  // HU-306: Adaptadores con Circuit Breaker
  public readonly breakers: Record<NotificationChannel, CircuitBreaker> = {
    WHATSAPP: new CircuitBreaker({ name: "meta-whatsapp", failureThreshold: 3, resetTimeoutMs: 30000 }),
    PUSH: new CircuitBreaker({ name: "expo-push", failureThreshold: 3, resetTimeoutMs: 30000 }),
    EMAIL: new CircuitBreaker({ name: "amazon-ses", failureThreshold: 3, resetTimeoutMs: 30000 }),
    SMS: new CircuitBreaker({ name: "sms-gateway", failureThreshold: 3, resetTimeoutMs: 30000 }),
    IN_APP: new CircuitBreaker({ name: "in-app-bus", failureThreshold: 10, resetTimeoutMs: 5000 })
  };

  constructor() {
    this.seedDefaultTemplates();
  }

  private seedDefaultTemplates(): void {
    this.templates.set("cash.discrepancy:PUSH:es-CO", {
      code: "cash.discrepancy",
      channel: "PUSH",
      locale: "es-CO",
      subject: "Descuadre en Cierre de Turno",
      body: "¡Alerta! Se detectó un faltante de {{amount}} en la caja {{terminal_code}}."
    });
    this.templates.set("debt.reminder:WHATSAPP:es-CO", {
      code: "debt.reminder",
      channel: "WHATSAPP",
      locale: "es-CO",
      subject: "Recordatorio de Saldo Pendiente",
      body: "Apreciado/a {{customer_name}}, {{tenant_name}} le recuerda su saldo pendiente de {{amount}}."
    });
    this.templates.set("sale.receipt:WHATSAPP:es-CO", {
      code: "sale.receipt",
      channel: "WHATSAPP",
      locale: "es-CO",
      subject: "Comprobante de Compra",
      body: "Gracias por su compra en {{tenant_name}}. Total pagado: {{total_amount}}."
    });
    this.templates.set("einvoice.receipt:WHATSAPP:es-CO", {
      code: "einvoice.receipt",
      channel: "WHATSAPP",
      locale: "es-CO",
      subject: "Documento Equivalente Electrónico POS",
      body: "Apreciado/a {{customer_name}}, {{tenant_name}} le adjunta su Documento Equivalente Electrónico POS No. {{invoice_number}} por valor de {{total_amount}} COP. CUDE: {{cude}}. Consulte la validez DIAN en: {{qr_url}}"
    });
    this.templates.set("einvoice.receipt:EMAIL:es-CO", {
      code: "einvoice.receipt",
      channel: "EMAIL",
      locale: "es-CO",
      subject: "Documento Equivalente Electrónico POS {{invoice_number}} - {{tenant_name}}",
      body: "Estimado/a {{customer_name}}:\n\nAdjuntamos la representación gráfica y XML UBL 2.1 de su Documento Equivalente Electrónico POS No. {{invoice_number}} emitido por {{tenant_name}}.\n\nTotal: {{total_amount}} COP\nCUDE: {{cude}}\nConsulta oficial DIAN: {{qr_url}}\n\nGracias por su compra."
    });
  }

  renderTemplate(
    templateCode: string,
    channel: NotificationChannel,
    locale: string = "es-CO",
    payload: Record<string, unknown> = {}
  ): { subject?: string; body: string } {
    const key = `${templateCode}:${channel}:${locale}`;
    const fallbackKey = `${templateCode}:${channel}:es-CO`;
    const template = this.templates.get(key) || this.templates.get(fallbackKey);

    if (!template) {
      return {
        subject: `Notificación ${templateCode}`,
        body: JSON.stringify(payload)
      };
    }

    let body = template.body;
    let subject = template.subject;

    for (const [k, v] of Object.entries(payload)) {
      const placeholder = new RegExp(`\\{\\{${k}\\}\\}`, "g");
      const valStr = v !== null && v !== undefined ? String(v) : "";
      body = body.replace(placeholder, valStr);
      if (subject) {
        subject = subject.replace(placeholder, valStr);
      }
    }

    return { subject, body };
  }

  registerPushDevice(params: {
    tenantId: string;
    userId: string;
    platform: "IOS" | "ANDROID" | "WEB";
    token: string;
    nowMs?: number;
  }): PushDeviceRecord {
    const id = newId();
    const record: PushDeviceRecord = {
      id,
      tenantId: params.tenantId,
      userId: params.userId,
      platform: params.platform,
      token: params.token,
      lastSeenAtMs: params.nowMs ?? Date.now(),
      revokedAtMs: null
    };
    this.pushDevices.set(id, record);
    return record;
  }

  setPreferences(pref: UserNotificationPreferences): void {
    const key = `${pref.tenantId}:${pref.userId}:${pref.topic}`;
    this.preferences.set(key, pref);
  }

  getChannelsForUser(tenantId: string, userId: string, topic: string): NotificationChannel[] {
    const key = `${tenantId}:${userId}:${topic}`;
    const pref = this.preferences.get(key);
    if (pref) return pref.channels;
    // Default channels
    return ["PUSH"];
  }

  /**
   * Envía o encola una notificación deduplicada
   */
  async queueNotification(params: {
    tenantId: string | null;
    userId: string | null;
    recipient: string;
    channel: NotificationChannel;
    templateCode: string;
    payload: Record<string, unknown>;
    dedupeKey: string;
    isDebtCollection?: boolean;
    debtorId?: string;
    nowMs?: number;
  }): Promise<NotificationRecord> {
    const nowMs = params.nowMs ?? Date.now();

    // Deduplicación idempotente
    const existingId = this.dedupeStore.get(params.dedupeKey);
    if (existingId) {
      return this.notifications.get(existingId)!;
    }

    let scheduledForMs = nowMs;
    let initialStatus: NotificationStatus = "QUEUED";

    // Verificación de Ley 2300 para recordatorios de cobranza (HU-109, HU-364)
    if (params.isDebtCollection) {
      if (params.debtorId && !this.ley2300.canContactDebtorThisWeek(params.debtorId, nowMs)) {
        throw new Error("400 LEY_2300_WEEKLY_CONTACT_LIMIT_EXCEEDED: Máximo 2 contactos semanales");
      }

      if (!this.ley2300.isLegalContactTime(nowMs)) {
        scheduledForMs = this.ley2300.computeNextLegalContactTime(nowMs);
        initialStatus = "QUEUED";
      }
    }

    const rendered = this.renderTemplate(params.templateCode, params.channel, "es-CO", params.payload);

    const notificationId = newId();
    const notif: NotificationRecord = {
      id: notificationId,
      tenantId: params.tenantId,
      userId: params.userId,
      recipient: params.recipient,
      channel: params.channel,
      templateCode: params.templateCode,
      payload: params.payload,
      dedupeKey: params.dedupeKey,
      status: initialStatus,
      provider: "primary",
      scheduledForMs,
      sentAtMs: null,
      isDebtCollection: params.isDebtCollection,
      renderedSubject: rendered.subject,
      renderedBody: rendered.body
    };

    this.notifications.set(notificationId, notif);
    this.dedupeStore.set(params.dedupeKey, notificationId);

    // Si ya es la hora legal, intentar despacho con Circuit Breaker y fallback (HU-306)
    if (scheduledForMs <= nowMs) {
      await this.dispatchNotification(notif, nowMs, params.debtorId);
    }

    return notif;
  }

  private async dispatchNotification(notif: NotificationRecord, nowMs: number, debtorId?: string): Promise<void> {
    const breaker = this.breakers[notif.channel];

    try {
      await breaker.execute(async () => {
        // Simulación de envío exitoso por el canal principal
        notif.status = "SENT";
        notif.sentAtMs = nowMs;
        if (notif.isDebtCollection && debtorId) {
          this.ley2300.recordContact(debtorId, nowMs);
        }
      }, { nowMs });
    } catch (err: unknown) {
      // HU-306: Si el canal principal tiene breaker ABIERTO o falla, despachar por canal de respaldo
      if (err instanceof CircuitOpenError || (err as any).name === "CircuitOpenError") {
        const fallbackChannel = notif.channel === "WHATSAPP" ? "EMAIL" : "IN_APP";
        const fallbackBreaker = this.breakers[fallbackChannel];

        try {
          await fallbackBreaker.execute(async () => {
            notif.channel = fallbackChannel;
            notif.provider = "fallback_backup";
            notif.status = "SENT";
            notif.sentAtMs = nowMs;
            if (notif.isDebtCollection && debtorId) {
              this.ley2300.recordContact(debtorId, nowMs);
            }
          }, { nowMs });
        } catch {
          notif.status = "FAILED";
          notif.error = "Fallback channel also failed";
        }
      } else {
        notif.status = "FAILED";
        notif.error = String(err);
      }
    }
  }

  async sendElectronicInvoiceReceipt(params: {
    tenantId: string;
    invoiceNumber: string;
    customerName: string;
    recipient: string;
    channel: "WHATSAPP" | "EMAIL";
    totalCents: number;
    cude: string;
    qrUrl: string;
    tenantName?: string;
    nowMs?: number;
  }): Promise<NotificationRecord> {
    const formattedTotal = `$${(params.totalCents / 100).toLocaleString("es-CO")}`;
    const dedupeKey = `einvoice:${params.tenantId}:${params.invoiceNumber}:${params.recipient}`;
    return this.queueNotification({
      tenantId: params.tenantId,
      userId: null,
      recipient: params.recipient,
      channel: params.channel,
      templateCode: "einvoice.receipt",
      payload: {
        customer_name: params.customerName,
        tenant_name: params.tenantName ?? "TienditaOnline",
        invoice_number: params.invoiceNumber,
        total_amount: formattedTotal,
        cude: params.cude,
        qr_url: params.qrUrl
      },
      dedupeKey,
      nowMs: params.nowMs
    });
  }

  listNotifications(tenantId?: string | null): NotificationRecord[] {
    const all = Array.from(this.notifications.values());
    if (!tenantId) return all;
    return all.filter((n) => n.tenantId === tenantId);
  }
}
