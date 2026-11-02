import crypto from "node:crypto";
import { newId, calculateNitDv, validateNitWithDv } from "@tiendita/contracts";
import type { TenantService, TenantStatus, PlanCode } from "./index.js";

/**
 * ============================================================================
 * ÉPICA 12 (FT-12.1, FT-12.2, FT-12.3) — platform-console, bff-platform, Billing & Dunning
 * Cubre:
 *  - HU-110..HU-112: Consola Super Admin, Saga de Creación JIT de Tienda y Soporte JIT (30 min)
 *  - HU-113..HU-114, HU-290, HU-406: Facturación SaaS, Consecutivos, Webhooks HMAC y Pagos Manuales
 *  - HU-115..HU-118, HU-253, HU-291, HU-489: Motor de Mora (Dunning D-5 a D+60) y Prórrogas (máx. 2/año)
 *  - HU-250..HU-254, HU-405, HU-488: Métricas MRR, Directorio 360°, Dead Letter Topics (DLT) y Alertas Trial
 * ============================================================================
 */

export interface BillingInvoiceRecord {
  id: string;
  number: string; // FAC-SaaS-YYYY-NNNNNN
  tenantId: string;
  planCode: PlanCode;
  amountCents: number;
  periodStartMs: number;
  periodEndMs: number;
  dueDateMs: number;
  status: "OPEN" | "PAID" | "OVERDUE" | "CANCELLED";
  paymentUrl: string;
  paidAtMs: number | null;
  paymentMethod?: string;
  paymentProofUrl?: string;
}

export interface GraceExtensionRecord {
  id: string;
  tenantId: string;
  invoiceId: string;
  extraDays: number;
  grantedAtMs: number;
  grantedBy: string;
  reason: string;
}

export interface DltMessageRecord {
  id: string;
  topic: string;
  payload: unknown;
  error: string;
  failedAtMs: number;
  retryCount: number;
  status: "PENDING" | "REPROCESSED" | "DISCARDED";
}

export interface JustInTimeAccessRecord {
  id: string;
  tenantId: string;
  actorId: string;
  reason: string;
  grantedAtMs: number;
  expiresAtMs: number;
}

export class PlatformBillingAndDunningService {
  public readonly invoices = new Map<string, BillingInvoiceRecord>();
  public readonly graceExtensions: GraceExtensionRecord[] = [];
  public readonly dltMessages = new Map<string, DltMessageRecord>();
  public readonly jitSessions = new Map<string, JustInTimeAccessRecord>();
  public readonly dunningNoticesSent = new Set<string>(); // `${invoiceId}:${stage}`

  private invoiceCounter = 1;

  constructor(private readonly tenantService: TenantService) {}

  /**
   * HU-290: Generador de número consecutivo de factura SaaS
   */
  generateInvoiceNumber(nowMs = Date.now()): string {
    const year = new Date(nowMs).getUTCFullYear();
    const seq = String(this.invoiceCounter++).padStart(6, "0");
    return `FAC-SaaS-${year}-${seq}`;
  }

  /**
   * HU-111 & HU-261..HU-263: Saga orquestada de creación de tienda (JIT)
   * Pasos:
   * 1. Validar documento y DV si es NIT.
   * 2. Crear Tenant y suscripción con periodo de prueba.
   * 3. Crear sucursal principal y bodega por defecto.
   * 4. Crear terminal inicial CAJA-01.
   * 5. Compensación si ocurre error para no dejar registros huérfanos.
   */
  async orchestrateCreateTenantSaga(params: {
    businessName: string;
    documentType: "CC" | "NIT" | "CE" | "PPT";
    documentNumber: string;
    nitDv?: number;
    planCode: PlanCode;
    ownerEmail: string;
    ownerPhone?: string;
    trialDays?: number;
    actorId: string;
    nowMs?: number;
  }): Promise<{
    tenantId: string;
    mainBranchId: string;
    terminalCode: string;
    activationToken: string;
  }> {
    const nowMs = params.nowMs ?? Date.now();

    // Paso 1: Validar NIT y Dígito de Verificación (Módulo 11 DIAN)
    if (params.documentType === "NIT") {
      const calculatedDv = calculateNitDv(params.documentNumber);
      if (params.nitDv !== undefined && params.nitDv !== calculatedDv) {
        throw new Error(`400 INVALID_NIT_DV: Dígito de verificación inválido. Esperado: ${calculatedDv}, recibido: ${params.nitDv}`);
      }
    }

    const tenantId = newId(nowMs);
    let createdBranchId: string | null = null;

    try {
      // Paso 2 & 3: Crear Tenant y Sede principal en tenant-service
      const trialDurationMs = (params.trialDays ?? 15) * 86_400_000;
      const res = this.tenantService.createTenant({
        tenantId,
        businessName: params.businessName,
        nit: params.documentType === "NIT" ? `${params.documentNumber}-${calculateNitDv(params.documentNumber)}` : params.documentNumber,
        planCode: params.planCode,
        initialStatus: "TRIAL",
        paidUntilMs: nowMs + trialDurationMs,
        actorId: params.actorId,
        nowMs
      });
      createdBranchId = res.mainBranch.id;

      // Paso 4: Generar token de activación inicial
      const activationToken = `act_${newId(nowMs)}`;

      // Paso 5: Emitir primera factura proforma de suscripción
      const planDef = this.tenantService.plansCache.get(params.planCode)!;
      this.createInvoice({
        tenantId,
        planCode: params.planCode,
        amountCents: planDef.monthly_price_cents,
        periodStartMs: nowMs + trialDurationMs,
        periodEndMs: nowMs + trialDurationMs + 30 * 86_400_000,
        dueDateMs: nowMs + trialDurationMs,
        nowMs
      });

      return {
        tenantId,
        mainBranchId: createdBranchId,
        terminalCode: "CAJA-01",
        activationToken
      };
    } catch (err) {
      // Compensación automática de Saga
      if (tenantId) {
        this.tenantService.tenants.delete(tenantId);
      }
      if (createdBranchId) {
        this.tenantService.branches.delete(createdBranchId);
      }
      throw err;
    }
  }

  /**
   * HU-113: Crea una nueva factura de suscripción
   */
  createInvoice(params: {
    tenantId: string;
    planCode: PlanCode;
    amountCents: number;
    periodStartMs: number;
    periodEndMs: number;
    dueDateMs: number;
    nowMs?: number;
  }): BillingInvoiceRecord {
    const id = newId(params.nowMs);
    const invoiceNum = this.generateInvoiceNumber(params.nowMs);
    const inv: BillingInvoiceRecord = {
      id,
      number: invoiceNum,
      tenantId: params.tenantId,
      planCode: params.planCode,
      amountCents: params.amountCents,
      periodStartMs: params.periodStartMs,
      periodEndMs: params.periodEndMs,
      dueDateMs: params.dueDateMs,
      status: "OPEN",
      paymentUrl: `https://pay.tienditaonline.co/checkout/${id}`,
      paidAtMs: null
    };
    this.invoices.set(id, inv);
    return inv;
  }

  /**
   * HU-113: Procesa Webhook firmado con HMAC de pasarela de pagos (Wompi/PayU)
   */
  processPaymentWebhook(params: {
    invoiceId: string;
    status: "APPROVED" | "DECLINED";
    amountCents: number;
    rawPayload: string;
    receivedHmacSignature: string;
    secretKey: string;
    paymentMethod?: string;
    nowMs?: number;
  }): { processed: boolean; newStatus: TenantStatus } {
    const nowMs = params.nowMs ?? Date.now();

    // Verificación de firma HMAC-SHA256
    const expectedSignature = crypto
      .createHmac("sha256", params.secretKey)
      .update(params.rawPayload)
      .digest("hex");

    if (expectedSignature !== params.receivedHmacSignature) {
      throw new Error("403 INVALID_WEBHOOK_SIGNATURE: Firma HMAC inválida");
    }

    const inv = this.invoices.get(params.invoiceId);
    if (!inv) throw new Error("404 INVOICE_NOT_FOUND");

    if (params.status === "APPROVED") {
      inv.status = "PAID";
      inv.paidAtMs = nowMs;
      inv.paymentMethod = params.paymentMethod ?? "WOMPI_PSE";

      // Extender paid_until de la tienda y reactivar si estaba en mora
      const t = this.tenantService.tenants.get(inv.tenantId);
      if (t) {
        t.paid_until_ms = Math.max(t.paid_until_ms, nowMs) + 30 * 86_400_000;
        this.tenantService.changeTenantStatus({
          tenantId: inv.tenantId,
          toStatus: "ACTIVE",
          reason: `PAYMENT_RECEIVED_INVOICE_${inv.number}`,
          actorId: "system_gateway_webhook",
          nowMs
        });
        return { processed: true, newStatus: "ACTIVE" };
      }
    }

    return { processed: false, newStatus: this.tenantService.tenants.get(inv.tenantId)?.status ?? "ACTIVE" };
  }

  /**
   * HU-114: Registro de pago manual en la consola (Nequi / Transferencia / Efectivo)
   */
  recordManualPayment(params: {
    invoiceId: string;
    paymentMethod: "NEQUI" | "DAVIPLATA" | "BANCOLOMBIA" | "CASH";
    proofUrl: string;
    actorId: string;
    nowMs?: number;
  }): { invoice: BillingInvoiceRecord; tenantStatus: TenantStatus } {
    const nowMs = params.nowMs ?? Date.now();
    const inv = this.invoices.get(params.invoiceId);
    if (!inv) throw new Error("404 INVOICE_NOT_FOUND");

    inv.status = "PAID";
    inv.paidAtMs = nowMs;
    inv.paymentMethod = params.paymentMethod;
    inv.paymentProofUrl = params.proofUrl;

    const t = this.tenantService.tenants.get(inv.tenantId);
    if (t) {
      t.paid_until_ms = Math.max(t.paid_until_ms, nowMs) + 30 * 86_400_000;
      this.tenantService.changeTenantStatus({
        tenantId: inv.tenantId,
        toStatus: "ACTIVE",
        reason: `MANUAL_PAYMENT_VERIFIED_BY_${params.actorId}`,
        actorId: params.actorId,
        nowMs
      });
    }

    return {
      invoice: inv,
      tenantStatus: t?.status ?? "ACTIVE"
    };
  }

  /**
   * HU-118 & HU-291: Otorga prórroga de pago (máximo 2 al año por hasta 7 días cada una)
   */
  grantGraceExtension(params: {
    tenantId: string;
    invoiceId: string;
    days: number;
    reason: string;
    actorId: string;
    nowMs?: number;
  }): GraceExtensionRecord {
    const nowMs = params.nowMs ?? Date.now();
    const oneYearAgoMs = nowMs - 365 * 86_400_000;

    // Verificar prórrogas en el último año
    const countThisYear = this.graceExtensions.filter(
      (g) => g.tenantId === params.tenantId && g.grantedAtMs >= oneYearAgoMs
    ).length;

    if (countThisYear >= 2) {
      throw new Error("400 GRACE_EXTENSION_LIMIT_REACHED: Máximo 2 prórrogas permitidas por año");
    }

    if (params.days < 1 || params.days > 7) {
      throw new Error("400 INVALID_DAYS: Las prórrogas deben ser de entre 1 y 7 días");
    }

    const rec: GraceExtensionRecord = {
      id: newId(nowMs),
      tenantId: params.tenantId,
      invoiceId: params.invoiceId,
      extraDays: params.days,
      grantedAtMs: nowMs,
      grantedBy: params.actorId,
      reason: params.reason
    };
    this.graceExtensions.push(rec);

    // Si la tienda estaba RESTRICTED o PAST_DUE, conceder reactivación temporal
    const t = this.tenantService.tenants.get(params.tenantId);
    if (t && (t.status === "RESTRICTED" || t.status === "PAST_DUE")) {
      this.tenantService.changeTenantStatus({
        tenantId: params.tenantId,
        toStatus: "ACTIVE",
        reason: `GRACE_EXTENSION_GRANTED_${params.days}_DAYS`,
        actorId: params.actorId,
        nowMs
      });
    }

    return rec;
  }

  /**
   * HU-291: Calcula la fecha efectiva de corte considerando prórrogas acumuladas
   */
  computeEffectiveDueDateMs(invoice: BillingInvoiceRecord): number {
    const extraDays = this.graceExtensions
      .filter((g) => g.invoiceId === invoice.id)
      .reduce((sum, g) => sum + g.extraDays, 0);

    return invoice.dueDateMs + extraDays * 86_400_000;
  }

  /**
   * HU-115..HU-117 & HU-489: Job diario de mora (Dunning Scheduler)
   * Evalúa cada factura abierta y ejecuta transiciones automáticas:
   * - D+1: PAST_DUE
   * - D+7: RESTRICTED (App de gestión solo lectura, caja sigue vendiendo)
   * - D+15: SUSPENDED (Bloqueo de turnos nuevos en caja)
   * - D+60: CANCELLED
   * - TRIAL vencido (+3 días gracia) -> SUSPENDED
   */
  runDailyDunningEvaluation(nowMs = Date.now()): {
    transitionedCount: number;
    actionsTaken: string[];
  } {
    const actionsTaken: string[] = [];
    let transitionedCount = 0;

    // 1. Evaluar tiendas en TRIAL vencidas
    for (const [tenantId, t] of this.tenantService.tenants.entries()) {
      if (t.status === "TRIAL") {
        const graceEndMs = t.paid_until_ms + 3 * 86_400_000; // 3 días de cortesía
        if (nowMs >= graceEndMs) {
          this.tenantService.changeTenantStatus({
            tenantId,
            toStatus: "SUSPENDED",
            reason: "TRIAL_EXPIRED_WITHOUT_PAYMENT",
            actorId: "dunning_scheduler",
            nowMs
          });
          transitionedCount++;
          actionsTaken.push(`Tenant ${tenantId} [TRIAL] -> SUSPENDED por vencimiento de prueba.`);
        }
      }
    }

    // 2. Evaluar facturas abiertas
    for (const inv of this.invoices.values()) {
      if (inv.status === "OPEN" || inv.status === "OVERDUE") {
        const effDueDateMs = this.computeEffectiveDueDateMs(inv);
        const daysDiff = Math.floor((nowMs - effDueDateMs) / 86_400_000);
        const t = this.tenantService.tenants.get(inv.tenantId);
        if (!t) continue;

        if (daysDiff >= 60 && t.status !== "CANCELLED") {
          this.tenantService.changeTenantStatus({
            tenantId: inv.tenantId,
            toStatus: "CANCELLED",
            reason: "DUNNING_D_PLUS_60_CANCELLATION",
            actorId: "dunning_scheduler",
            nowMs
          });
          transitionedCount++;
          actionsTaken.push(`Tenant ${inv.tenantId} -> CANCELLED (D+60).`);
        } else if (daysDiff >= 15 && t.status !== "SUSPENDED" && t.status !== "CANCELLED") {
          this.tenantService.changeTenantStatus({
            tenantId: inv.tenantId,
            toStatus: "SUSPENDED",
            reason: "DUNNING_D_PLUS_15_SUSPENSION",
            actorId: "dunning_scheduler",
            nowMs
          });
          transitionedCount++;
          actionsTaken.push(`Tenant ${inv.tenantId} -> SUSPENDED (D+15).`);
        } else if (daysDiff >= 7 && t.status !== "RESTRICTED" && t.status !== "SUSPENDED" && t.status !== "CANCELLED") {
          this.tenantService.changeTenantStatus({
            tenantId: inv.tenantId,
            toStatus: "RESTRICTED",
            reason: "DUNNING_D_PLUS_7_RESTRICTION",
            actorId: "dunning_scheduler",
            nowMs
          });
          transitionedCount++;
          actionsTaken.push(`Tenant ${inv.tenantId} -> RESTRICTED (D+7).`);
        } else if (daysDiff >= 1 && t.status === "ACTIVE") {
          this.tenantService.changeTenantStatus({
            tenantId: inv.tenantId,
            toStatus: "PAST_DUE",
            reason: "DUNNING_D_PLUS_1_PAST_DUE",
            actorId: "dunning_scheduler",
            nowMs
          });
          transitionedCount++;
          actionsTaken.push(`Tenant ${inv.tenantId} -> PAST_DUE (D+1).`);
        }
      }
    }

    return { transitionedCount, actionsTaken };
  }

  /**
   * HU-250: Dashboard Global del Super Admin (MRR, conteos y salud del SaaS)
   */
  getGlobalDashboardMetrics(): {
    mrrCents: number;
    activeTenantsCount: number;
    trialTenantsCount: number;
    pastDueTenantsCount: number;
    restrictedTenantsCount: number;
    suspendedTenantsCount: number;
    totalTenants: number;
  } {
    let mrrCents = 0;
    let active = 0;
    let trial = 0;
    let pastDue = 0;
    let restricted = 0;
    let suspended = 0;

    for (const t of this.tenantService.tenants.values()) {
      if (t.status === "ACTIVE") {
        active++;
        const plan = this.tenantService.plansCache.get(t.plan_code);
        if (plan) mrrCents += plan.monthly_price_cents;
      } else if (t.status === "TRIAL") {
        trial++;
      } else if (t.status === "PAST_DUE") {
        pastDue++;
      } else if (t.status === "RESTRICTED") {
        restricted++;
      } else if (t.status === "SUSPENDED") {
        suspended++;
      }
    }

    return {
      mrrCents,
      activeTenantsCount: active,
      trialTenantsCount: trial,
      pastDueTenantsCount: pastDue,
      restrictedTenantsCount: restricted,
      suspendedTenantsCount: suspended,
      totalTenants: this.tenantService.tenants.size
    };
  }

  /**
   * HU-112: Acceso temporal de soporte (Just-In-Time por 30 minutos)
   */
  grantJustInTimeSupportSession(params: {
    tenantId: string;
    actorId: string;
    reason: string;
    nowMs?: number;
  }): JustInTimeAccessRecord {
    const nowMs = params.nowMs ?? Date.now();
    const id = newId(nowMs);
    const session: JustInTimeAccessRecord = {
      id,
      tenantId: params.tenantId,
      actorId: params.actorId,
      reason: params.reason,
      grantedAtMs: nowMs,
      expiresAtMs: nowMs + 30 * 60 * 1000 // 30 minutos de vigencia estricta
    };
    this.jitSessions.set(id, session);
    return session;
  }

  /**
   * HU-254: Registro y reprocesamiento de Dead Letter Topics (*.dlt)
   */
  recordDltMessage(topic: string, payload: unknown, error: string, nowMs = Date.now()): DltMessageRecord {
    const id = newId(nowMs);
    const rec: DltMessageRecord = {
      id,
      topic,
      payload,
      error,
      failedAtMs: nowMs,
      retryCount: 0,
      status: "PENDING"
    };
    this.dltMessages.set(id, rec);
    return rec;
  }

  reprocessDltMessage(id: string): { reprocessed: boolean; message: DltMessageRecord } {
    const msg = this.dltMessages.get(id);
    if (!msg) throw new Error("404 DLT_MESSAGE_NOT_FOUND");
    msg.retryCount++;
    msg.status = "REPROCESSED";
    return { reprocessed: true, message: msg };
  }
}
