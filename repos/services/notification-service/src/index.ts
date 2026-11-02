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
}

/**
 * HU-109 & HU-364: Verificador de Cumplimiento de la Ley 2300 de 2023 ("Dejen de fregar")
 * Reglas:
 * 1. Lunes a Viernes: 07:00 a 19:00 (hora local Colombia UTC-5)
 * 2. Sábados: 08:00 a 15:00 (hora local Colombia UTC-5)
 * 3. Domingos y días festivos: PROHIBIDO TODO CONTACTO DE COBRANZA
 * 4. Máximo 2 contactos de cobranza por semana por deudor
 */
export class Ley2300ComplianceEngine {
  // Lista de festivos colombianos (muestra para pruebas y cálculo de calendario)
  private readonly holidays = new Set<string>([
    "2026-01-01",
    "2026-01-12",
    "2026-03-23",
    "2026-04-02",
    "2026-04-03",
    "2026-05-01",
    "2026-05-18",
    "2026-06-08",
    "2026-06-15",
    "2026-06-29",
    "2026-07-20",
    "2026-08-07",
    "2026-08-17",
    "2026-10-12",
    "2026-11-02",
    "2026-11-16",
    "2026-12-08",
    "2026-12-25"
  ]);

  // Contador auditable de contactos semanales por deudor (HU-364)
  // Llave: `${debtorId}:${yearWeek}` -> número de contactos en esa semana
  public readonly weeklyContactCounters = new Map<string, number>();

  isLegalContactTime(timestampMs: number): boolean {
    const d = new Date(timestampMs);
    // Colombia es UTC-5
    const utcHours = d.getUTCHours();
    const colombiaHours = (utcHours - 5 + 24) % 24;
    const colombiaMinutes = d.getUTCMinutes();
    const timeDec = colombiaHours + colombiaMinutes / 60;

    // Día de la semana (0=Domingo, 1=Lunes, ..., 6=Sábado)
    const dayOfWeek = d.getUTCDay();
    const dateStr = d.toISOString().slice(0, 10);

    // Domingos y festivos prohibidos
    if (dayOfWeek === 0 || this.holidays.has(dateStr)) {
      return false;
    }

    // Lunes a Viernes: 07:00 a 19:00
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      return timeDec >= 7 && timeDec < 19;
    }

    // Sábados: 08:00 a 15:00
    if (dayOfWeek === 6) {
      return timeDec >= 8 && timeDec < 15;
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
    const d = new Date(timestampMs);
    const year = d.getUTCFullYear();
    const dayOfYear = Math.floor((d.getTime() - new Date(year, 0, 1).getTime()) / 86400000);
    const week = Math.ceil((dayOfYear + 1) / 7);
    return `${year}-W${week}`;
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
      isDebtCollection: params.isDebtCollection
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
}
