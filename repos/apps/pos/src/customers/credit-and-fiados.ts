import {
  newId,
  canonicalSha256,
  CustomerCreatedV1Schema,
  CreditPaymentReceivedV1Schema
} from "@tiendita/contracts";
import { EncryptedPosStorage } from "../storage/local-db.js";
import { PosSecurityAndAuthKernel } from "../security/device-auth-and-audit.js";
import { PosCashSessionManager } from "../cash/shifts-and-blind-count.js";

/**
 * ÉPICA 06 (FT-06.1 & FT-06.2) — Clientes y Cartera de Fiados en Caja (Offline)
 * Cubre: HU-059, HU-060, HU-061, HU-062, HU-216, HU-217, HU-224, HU-324, HU-325, HU-355, HU-360, HU-449.
 */

export interface LocalCustomerRow {
  id: string;
  doc_type: "CC" | "NIT" | "CE" | "PPT" | "TI" | "PA" | null;
  doc_number: string | null;
  full_name: string;
  alias: string | null;
  phone: string | null;
  email: string | null;
  credit_enabled: boolean;
  credit_limit_cents: number;
  credit_mode: "SOFT" | "ALLOCATED" | "ONLINE_ONLY";
  server_balance_cents: number;
  authorized_pickups: string[]; // HU-355: Personas autorizadas para pedir fiado
  warning_note: string | null;
  data_consent_at: string | null;
  deleted: boolean;
}

export interface LocalCreditMovementRow {
  id: string;
  customer_id: string;
  amount_cents: number; // + cargo, - abono
  sale_id: string | null;
  pickup_person: string | null;
  occurred_at_ms: number;
  synced: boolean;
  voided: boolean;
}

export function normalizeSearchText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export class PosCustomersAndCreditManager {
  public readonly customers = new Map<string, LocalCustomerRow>();
  public readonly creditMovements: LocalCreditMovementRow[] = [];

  constructor(
    private readonly storage: EncryptedPosStorage,
    private readonly auth: PosSecurityAndAuthKernel,
    private readonly cash: PosCashSessionManager
  ) {}

  upsertReplicaCustomer(customer: LocalCustomerRow): void {
    this.customers.set(customer.id, { ...customer });
  }

  /**
   * HU-059 & HU-216: Alta rápida de cliente en caja con Habeas Data obligatorio si registra teléfono/email,
   * deduplicación local por `(doc_type, doc_number)` y `credit_enabled = false` por defecto hasta que se habilite.
   */
  cmdCreateQuickCustomer(params: {
    fullName: string;
    alias?: string | null;
    docType?: "CC" | "NIT" | "CE" | "PPT" | "TI" | "PA" | null;
    docNumber?: string | null;
    phone?: string | null;
    email?: string | null;
    dataConsentAccepted: boolean;
    authorizedPickups?: string[];
    warningNote?: string | null;
    nowMs?: number;
  }): LocalCustomerRow {
    const nowMs = params.nowMs ?? Date.now();

    // HU-216: Deduplicación si ya existe el mismo documento localmente
    if (params.docType && params.docNumber) {
      for (const existing of this.customers.values()) {
        if (
          !existing.deleted &&
          existing.doc_type === params.docType &&
          existing.doc_number === params.docNumber.trim()
        ) {
          return existing;
        }
      }
    }

    const nowIso = new Date(nowMs).toISOString();
    const customerId = newId(nowMs);
    const payload = CustomerCreatedV1Schema.parse({
      customer_id: customerId,
      full_name: params.fullName,
      alias: params.alias ?? null,
      doc_type: params.docType ?? null,
      doc_number: params.docNumber ? params.docNumber.trim() : null,
      phone: params.phone ? params.phone.trim() : null,
      email: params.email ? params.email.trim() : null,
      data_consent_at: params.dataConsentAccepted ? nowIso : null,
      created_at: nowIso
    });

    const row: LocalCustomerRow = {
      id: customerId,
      doc_type: payload.doc_type,
      doc_number: payload.doc_number,
      full_name: payload.full_name,
      alias: payload.alias,
      phone: payload.phone,
      email: payload.email,
      credit_enabled: false,
      credit_limit_cents: 0,
      credit_mode: "SOFT",
      server_balance_cents: 0,
      authorized_pickups: params.authorizedPickups ?? [payload.full_name],
      warning_note: params.warningNote ?? null,
      data_consent_at: payload.data_consent_at,
      deleted: false
    };

    this.customers.set(customerId, row);
    this.enqueueOutboxEvent("customer.created", payload, nowMs);
    return row;
  }

  /**
   * HU-060, HU-216, HU-324 & HU-448: Búsqueda insensible a tildes/mayúsculas por nombre, alias, documento o teléfono
   * y cálculo de saldo estimado (`server_balance + sum(local_credit_movements no sincronizados)`).
   */
  getCustomerCreditStatus(customerId: string): {
    customer: LocalCustomerRow;
    estimatedBalanceCents: number;
    availableCreditCents: number;
    isCreditBlockedBanner: string | null;
  } {
    const c = this.customers.get(customerId);
    if (!c || c.deleted) {
      throw new Error("CUSTOMER_NOT_FOUND");
    }
    const unsyncedDelta = this.creditMovements
      .filter((m) => m.customer_id === customerId && !m.synced && !m.voided)
      .reduce((acc, m) => acc + m.amount_cents, 0);

    const estimatedBalanceCents = c.server_balance_cents + unsyncedDelta;
    const availableCreditCents = c.credit_enabled
      ? Math.max(0, c.credit_limit_cents - estimatedBalanceCents)
      : 0;

    const isCreditBlockedBanner = !c.credit_enabled
      ? `Fiado bloqueado — Saldo pendiente: $ ${Math.round(estimatedBalanceCents / 100).toLocaleString("es-CO")} (Solo venta de contado o abono)`
      : null;

    return {
      customer: c,
      estimatedBalanceCents,
      availableCreditCents,
      isCreditBlockedBanner
    };
  }

  cmdSearchCustomers(query: string): ReturnType<PosCustomersAndCreditManager["getCustomerCreditStatus"]>[] {
    const q = normalizeSearchText(query);
    const matches: ReturnType<PosCustomersAndCreditManager["getCustomerCreditStatus"]>[] = [];

    for (const c of this.customers.values()) {
      if (c.deleted) continue;
      const haystack = normalizeSearchText(
        `${c.full_name} ${c.alias ?? ""} ${c.doc_number ?? ""} ${c.phone ?? ""}`
      );
      if (!q || haystack.includes(q)) {
        matches.push(this.getCustomerCreditStatus(c.id));
      }
    }
    return matches.slice(0, 30);
  }

  /**
   * HU-061 & HU-355: Valida y registra el cargo de una venta a crédito respetando:
   * - `credit_enabled`
   * - persona autorizada que retira el pedido (`authorized_pickups`)
   * - modo de cupo (`SOFT` exige PIN de supervisor/dueño si supera cupo; `ALLOCATED` no permite superar; `ONLINE_ONLY` exige online)
   */
  validateAndRecordCreditCharge(params: {
    customerId: string;
    chargeAmountCents: number;
    saleId: string;
    pickupPerson?: string | null;
    isOnline?: boolean;
    approvalNonce?: string;
    nowMs?: number;
  }): { previousBalanceCents: number; newBalanceCents: number; movement: LocalCreditMovementRow } {
    const nowMs = params.nowMs ?? Date.now();
    const status = this.getCustomerCreditStatus(params.customerId);
    const { customer, estimatedBalanceCents } = status;

    if (!customer.credit_enabled) {
      throw new Error("CUSTOMER_CREDIT_DISABLED");
    }

    if (customer.credit_mode === "ONLINE_ONLY" && !params.isOnline) {
      throw new Error("CREDIT_MODE_ONLINE_ONLY_REQUIRES_INTERNET");
    }

    if (
      params.pickupPerson &&
      customer.authorized_pickups.length > 0 &&
      !customer.authorized_pickups.includes(params.pickupPerson)
    ) {
      throw new Error(`UNAUTHORIZED_PICKUP_PERSON:${params.pickupPerson}`);
    }

    const newBalanceCents = estimatedBalanceCents + params.chargeAmountCents;
    const exceedsLimit = newBalanceCents > customer.credit_limit_cents;

    if (exceedsLimit) {
      if (customer.credit_mode === "ALLOCATED") {
        throw new Error("CREDIT_LIMIT_EXCEEDED_ALLOCATED_MODE");
      }
      if (!params.approvalNonce) {
        throw new Error("CREDIT_LIMIT_EXCEEDED_APPROVAL_REQUIRED");
      }
      const consumed = this.auth.consumeApprovalNonce(
        params.approvalNonce,
        "credit.exceed_limit",
        nowMs
      );
      this.auth.recordAudit(
        "credit.exceed_limit",
        null,
        consumed.approverId,
        customer.id,
        {
          previous_balance_cents: estimatedBalanceCents,
          charge_cents: params.chargeAmountCents,
          limit_cents: customer.credit_limit_cents
        },
        nowMs
      );
    }

    const mov: LocalCreditMovementRow = {
      id: newId(nowMs),
      customer_id: customer.id,
      amount_cents: params.chargeAmountCents,
      sale_id: params.saleId,
      pickup_person: params.pickupPerson ?? customer.full_name,
      occurred_at_ms: nowMs,
      synced: false,
      voided: false
    };
    this.creditMovements.push(mov);

    return {
      previousBalanceCents: estimatedBalanceCents,
      newBalanceCents,
      movement: mov
    };
  }

  /**
   * HU-062 & HU-217: Registro atómico de abono de cartera en caja (efectivo o digital),
   * sumando al efectivo esperado del turno si fue en `CASH` y encolando `credit.payment.received`.
   */
  cmdRecordCreditPayment(params: {
    customerId: string;
    cashSessionId: string;
    amountCents: number;
    method: "CASH" | "DEBIT" | "CREDIT_CARD" | "NEQUI" | "DAVIPLATA" | "BRE_B" | "TRANSFER";
    reference?: string | null;
    receivedBy: string;
    allowOverpayment?: boolean;
    nowMs?: number;
  }): {
    movementId: string;
    previousBalanceCents: number;
    newBalanceCents: number;
  } {
    const nowMs = params.nowMs ?? Date.now();
    const { estimatedBalanceCents } = this.getCustomerCreditStatus(params.customerId);

    if (params.amountCents > estimatedBalanceCents && !params.allowOverpayment) {
      throw new Error(
        `PAYMENT_EXCEEDS_DEBT: El valor supera el saldo pendiente (${estimatedBalanceCents})`
      );
    }

    const movementId = newId(nowMs);
    const payload = CreditPaymentReceivedV1Schema.parse({
      movement_id: movementId,
      customer_id: params.customerId,
      cash_session_id: params.cashSessionId,
      amount_cents: params.amountCents,
      method: params.method,
      reference: params.reference ?? null,
      received_by: params.receivedBy,
      occurred_at: new Date(nowMs).toISOString()
    });

    this.creditMovements.push({
      id: movementId,
      customer_id: params.customerId,
      amount_cents: -params.amountCents,
      sale_id: null,
      pickup_person: null,
      occurred_at_ms: nowMs,
      synced: false,
      voided: false
    });

    if (params.method === "CASH") {
      this.cash.movements.push({
        id: newId(nowMs),
        cash_session_id: params.cashSessionId,
        kind: "CREDIT_PAYMENT_CASH",
        amount_cents: params.amountCents,
        reason: `Abono cartera cliente ${params.customerId}`,
        approved_by: null,
        created_by: params.receivedBy,
        occurred_at_ms: nowMs,
        voided: false
      });
    }

    this.enqueueOutboxEvent("credit.payment.received", payload, nowMs);

    return {
      movementId,
      previousBalanceCents: estimatedBalanceCents,
      newBalanceCents: estimatedBalanceCents - params.amountCents
    };
  }

  /**
   * HU-449: Anulación de un abono de cartera registrado por error en el turno actual (con PIN de supervisor y motivo).
   */
  cmdVoidCreditPayment(params: {
    movementId: string;
    cashSessionId: string;
    approvalNonce: string;
    reason: string;
    nowMs?: number;
  }): { restoredBalanceCents: number } {
    const nowMs = params.nowMs ?? Date.now();
    const mov = this.creditMovements.find(
      (m) => m.id === params.movementId && m.amount_cents < 0 && !m.voided
    );
    if (!mov) {
      throw new Error("CREDIT_PAYMENT_NOT_FOUND");
    }

    const consumed = this.auth.consumeApprovalNonce(params.approvalNonce, "sale.void", nowMs);
    mov.voided = true;

    const cashMov = this.cash.movements.find(
      (cm) =>
        cm.cash_session_id === params.cashSessionId &&
        cm.kind === "CREDIT_PAYMENT_CASH" &&
        cm.amount_cents === Math.abs(mov.amount_cents) &&
        !cm.voided
    );
    if (cashMov) {
      cashMov.voided = true;
    }

    this.auth.recordAudit(
      "credit.payment.voided",
      null,
      consumed.approverId,
      mov.id,
      { reason: params.reason, restored_cents: Math.abs(mov.amount_cents) },
      nowMs
    );

    const status = this.getCustomerCreditStatus(mov.customer_id);
    return { restoredBalanceCents: status.estimatedBalanceCents };
  }

  private enqueueOutboxEvent(eventType: string, payloadObj: unknown, nowMs: number): void {
    const seq = this.auth.deviceState
      ? this.auth.deviceState.next_terminal_seq++
      : this.storage.outbox.length + 1;
    const hlc = this.auth.advanceClockAndGenerateHlc(nowMs);
    this.storage.outbox.push({
      event_id: newId(nowMs),
      terminal_seq: seq,
      event_type: eventType,
      schema_version: 1,
      payload: JSON.stringify(payloadObj),
      payload_hash: canonicalSha256(payloadObj),
      occurred_at: nowMs,
      hlc,
      status: "PENDING",
      attempts: 0,
      last_error: null,
      sent_at: null
    });
  }
}
