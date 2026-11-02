import {
  newId,
  canonicalSha256,
  calculateCopDenominationsTotalCents,
  CashSessionOpenedV1Schema,
  CashSessionClosedV1Schema,
  CashMovementRecordedV1Schema,
  CashSessionReopenedV1Schema
} from "@tiendita/contracts";
import { EncryptedPosStorage } from "../storage/local-db.js";
import { PosSecurityAndAuthKernel } from "../security/device-auth-and-audit.js";

/**
 * ÉPICA 05 (FT-05.1 & FT-05.2) — Control de Turnos, Efectivo y Arqueo Ciego
 * Cubre: HU-053..HU-058, HU-205..HU-209, HU-222, HU-223, HU-326, HU-419, HU-420, HU-450, HU-451, HU-455.
 */

export interface LocalCashSession {
  id: string;
  opened_by: string;
  opened_at_ms: number;
  opening_float_cents: number;
  closed_by: string | null;
  closed_at_ms: number | null;
  expected_cash_cents: number | null;
  declared_cash_cents: number | null;
  difference_cents: number | null;
  declared_denominations: Record<string, number> | null;
  status: "OPEN" | "CLOSED" | "FORCE_CLOSED" | "REOPENED";
  reopen_history: {
    previous_declared_cents: number;
    previous_difference_cents: number;
    reopened_by: string;
    reason: string;
    at_ms: number;
  }[];
}

export interface LocalCashMovement {
  id: string;
  cash_session_id: string;
  kind:
    | "SALE_CASH"
    | "CHANGE_GIVEN"
    | "REFUND_CASH"
    | "CREDIT_PAYMENT_CASH"
    | "CASH_IN"
    | "CASH_OUT"
    | "EXPENSE"
    | "SUPPLIER_PAYMENT"
    | "SAFE_DROP";
  amount_cents: number; // positivo
  reason: string;
  approved_by: string | null;
  created_by: string;
  occurred_at_ms: number;
  voided: boolean;
}

export class PosCashSessionManager {
  public readonly sessions: LocalCashSession[] = [];
  public readonly movements: LocalCashMovement[] = [];
  public cashOutApprovalThresholdCents = 2_000_000; // $20.000 COP
  public safeDropAlertThresholdCents = 50_000_000; // $500.000 COP

  constructor(
    private readonly storage: EncryptedPosStorage,
    private readonly auth: PosSecurityAndAuthKernel
  ) {}

  /**
   * HU-205 & HU-326: Consulta el turno abierto actual, detectando si lleva > 16 horas abierto (`is_stale`)
   * y ocultando `expected_cash_cents` si el usuario no tiene permiso `cash.session.view_expected`.
   */
  cmdGetOpenCashSession(
    nowMs = Date.now(),
    callerPermissions: string[] = []
  ): {
    session: Omit<LocalCashSession, "expected_cash_cents"> & { expected_cash_cents: number | null };
    isStale: boolean;
    suggestSafeDrop: boolean;
  } | null {
    const open = this.sessions.find((s) => s.status === "OPEN" || s.status === "REOPENED");
    if (!open) return null;

    const currentExpected = this.computeExpectedCashCents(open.id);
    const canViewExpected = callerPermissions.includes("cash.session.view_expected");
    const isStale = nowMs - open.opened_at_ms > 16 * 60 * 60 * 1000;
    const suggestSafeDrop = currentExpected > this.safeDropAlertThresholdCents;

    return {
      session: {
        ...open,
        expected_cash_cents: canViewExpected ? currentExpected : null
      },
      isStale,
      suggestSafeDrop
    };
  }

  /**
   * HU-053, HU-206 & HU-222: Abre un nuevo turno con base inicial (directa o calculada por denominación COP),
   * bloqueando si la licencia está en SUSPENDED/vencida o si ya existe un turno OPEN.
   */
  cmdOpenCashSession(params: {
    openedBy: string;
    openingFloatCents?: number;
    openingDenominations?: Record<string, number>;
    nowMs?: number;
  }): LocalCashSession {
    const nowMs = params.nowMs ?? Date.now();
    const banner = this.auth.evaluateOperationalLicenseBanner("CASHIER", nowMs);
    if (!banner.canOpenNewShiftAndSell) {
      throw new Error("LICENSE_READ_ONLY_CANNOT_OPEN_SHIFT");
    }

    const existingOpen = this.sessions.find((s) => s.status === "OPEN" || s.status === "REOPENED");
    if (existingOpen) {
      const isStale = nowMs - existingOpen.opened_at_ms > 16 * 60 * 60 * 1000;
      throw new Error(
        isStale
          ? "STALE_OPEN_SESSION_MUST_BE_CLOSED_FIRST"
          : "CASH_SESSION_ALREADY_OPEN"
      );
    }

    const floatCents =
      params.openingDenominations !== undefined
        ? calculateCopDenominationsTotalCents(params.openingDenominations)
        : (params.openingFloatCents ?? 0);

    if (!Number.isInteger(floatCents) || floatCents < 0) {
      throw new Error("INVALID_OPENING_FLOAT");
    }

    const sessionId = newId(nowMs);
    const payload = CashSessionOpenedV1Schema.parse({
      cash_session_id: sessionId,
      opened_by: params.openedBy,
      opened_at: new Date(nowMs).toISOString(),
      opening_float_cents: floatCents,
      opening_denominations: params.openingDenominations
    });

    const session: LocalCashSession = {
      id: sessionId,
      opened_by: params.openedBy,
      opened_at_ms: nowMs,
      opening_float_cents: floatCents,
      closed_by: null,
      closed_at_ms: null,
      expected_cash_cents: null,
      declared_cash_cents: null,
      difference_cents: null,
      declared_denominations: null,
      status: "OPEN",
      reopen_history: []
    };

    this.sessions.push(session);
    this.enqueueOutboxEvent("cash.session.opened", payload, nowMs);
    return session;
  }

  /**
   * HU-057: Fórmula exacta de efectivo esperado en gaveta:
   * `base + ventas_efectivo_recibido - cambio + entradas - salidas - retiros - devoluciones_efectivo + abonos_cartera_efectivo`.
   */
  computeExpectedCashCents(sessionId: string): number {
    const session = this.sessions.find((s) => s.id === sessionId);
    if (!session) {
      throw new Error("CASH_SESSION_NOT_FOUND");
    }
    let expected = session.opening_float_cents;
    for (const m of this.movements) {
      if (m.cash_session_id !== sessionId || m.voided) continue;
      switch (m.kind) {
        case "SALE_CASH":
        case "CASH_IN":
        case "CREDIT_PAYMENT_CASH":
          expected += m.amount_cents;
          break;
        case "CHANGE_GIVEN":
        case "REFUND_CASH":
        case "CASH_OUT":
        case "EXPENSE":
        case "SUPPLIER_PAYMENT":
        case "SAFE_DROP":
          expected -= m.amount_cents;
          break;
      }
    }
    return expected;
  }

  /**
   * HU-054, HU-055, HU-207 & HU-419: Registra entradas, gastos, pagos a proveedor o retiros parciales (safe drop),
   * exigiendo `approvalNonce` si supera el umbral e impidiendo sacar más efectivo del que hay en gaveta.
   */
  cmdRecordCashMovement(params: {
    cashSessionId: string;
    kind: "CASH_IN" | "CASH_OUT" | "EXPENSE" | "SUPPLIER_PAYMENT" | "SAFE_DROP";
    amountCents: number;
    reason: string;
    createdBy: string;
    approvalNonce?: string;
    nowMs?: number;
  }): LocalCashMovement {
    const nowMs = params.nowMs ?? Date.now();
    const session = this.sessions.find((s) => s.id === params.cashSessionId);
    if (!session || (session.status !== "OPEN" && session.status !== "REOPENED")) {
      throw new Error("NO_OPEN_CASH_SESSION");
    }

    const isOutflow = params.kind !== "CASH_IN";
    if (isOutflow) {
      const available = this.computeExpectedCashCents(session.id);
      if (params.amountCents > available) {
        throw new Error(
          `INSUFFICIENT_CASH_IN_DRAWER: Monto (${params.amountCents}) supera el disponible (${available})`
        );
      }
    }

    let approvedBy: string | null = null;
    if (
      params.kind === "SAFE_DROP" ||
      (isOutflow && params.amountCents > this.cashOutApprovalThresholdCents)
    ) {
      if (!params.approvalNonce) {
        throw new Error("APPROVAL_REQUIRED");
      }
      const consumed = this.auth.consumeApprovalNonce(
        params.approvalNonce,
        "cash.movement.out",
        nowMs
      );
      approvedBy = consumed.approverId;
    }

    const movId = newId(nowMs);
    const payload = CashMovementRecordedV1Schema.parse({
      movement_id: movId,
      cash_session_id: session.id,
      kind: params.kind,
      amount_cents: params.amountCents,
      reason: params.reason,
      approved_by: approvedBy,
      created_by: params.createdBy,
      occurred_at: new Date(nowMs).toISOString()
    });

    const mov: LocalCashMovement = {
      id: movId,
      cash_session_id: session.id,
      kind: params.kind,
      amount_cents: params.amountCents,
      reason: payload.reason,
      approved_by: approvedBy,
      created_by: params.createdBy,
      occurred_at_ms: nowMs,
      voided: false
    };

    this.movements.push(mov);
    this.enqueueOutboxEvent("cash.movement.recorded", payload, nowMs);
    return mov;
  }

  /**
   * HU-450: Anulación de un movimiento de caja digitado por error en el turno abierto con PIN de supervisor.
   */
  cmdVoidCashMovement(params: {
    movementId: string;
    approvalNonce: string;
    reason: string;
    nowMs?: number;
  }): void {
    const nowMs = params.nowMs ?? Date.now();
    const mov = this.movements.find((m) => m.id === params.movementId && !m.voided);
    if (!mov) {
      throw new Error("CASH_MOVEMENT_NOT_FOUND");
    }
    const consumed = this.auth.consumeApprovalNonce(
      params.approvalNonce,
      "cash.movement.out",
      nowMs
    );
    mov.voided = true;
    this.auth.recordAudit(
      "cash.movement.voided",
      mov.created_by,
      consumed.approverId,
      mov.id,
      { reason: params.reason, original_amount_cents: mov.amount_cents },
      nowMs
    );
  }

  /**
   * HU-451: Corte parcial informativo ("Reporte X") exclusivo para usuario con permiso `cash.session.view_expected`.
   */
  cmdGenerateReportX(params: {
    cashSessionId: string;
    approvalNonce: string;
    nowMs?: number;
  }): { expectedCashCents: number; generatedAtMs: number } {
    const nowMs = params.nowMs ?? Date.now();
    const consumed = this.auth.consumeApprovalNonce(
      params.approvalNonce,
      "cash.session.view_expected",
      nowMs
    );
    const expectedCashCents = this.computeExpectedCashCents(params.cashSessionId);
    this.auth.recordAudit(
      "cash.session.x_report",
      consumed.approverId,
      consumed.approverId,
      params.cashSessionId,
      { expected_cash_cents: expectedCashCents },
      nowMs
    );
    return { expectedCashCents, generatedAtMs: nowMs };
  }

  /**
   * HU-056, HU-057, HU-208, HU-223 & HU-420: Cierre de turno con arqueo ciego por denominación COP.
   * Calcula internamente el esperado y la diferencia sin haber revelado nunca el esperado al cajero.
   */
  cmdCloseCashSessionBlind(params: {
    cashSessionId: string;
    closedBy: string;
    declaredDenominations: Record<string, number>;
    declaredOtherMethodsCents?: Record<string, number>;
    parkedCartsCount?: number;
    confirmDiscardParkedCarts?: boolean;
    nowMs?: number;
  }): LocalCashSession {
    const nowMs = params.nowMs ?? Date.now();
    if ((params.parkedCartsCount ?? 0) > 0 && !params.confirmDiscardParkedCarts) {
      throw new Error("PARKED_CARTS_PENDING_CONFIRMATION");
    }

    const session = this.sessions.find((s) => s.id === params.cashSessionId);
    if (!session || (session.status !== "OPEN" && session.status !== "REOPENED")) {
      throw new Error("CASH_SESSION_NOT_OPEN");
    }

    const expectedCashCents = this.computeExpectedCashCents(session.id);
    const declaredCashCents = calculateCopDenominationsTotalCents(params.declaredDenominations);
    const differenceCents = declaredCashCents - expectedCashCents;

    const payload = CashSessionClosedV1Schema.parse({
      cash_session_id: session.id,
      closed_by: params.closedBy,
      closed_at: new Date(nowMs).toISOString(),
      opening_float_cents: session.opening_float_cents,
      expected_cash_cents: expectedCashCents,
      declared_cash_cents: declaredCashCents,
      difference_cents: differenceCents,
      declared_denominations: params.declaredDenominations,
      declared_other_methods_cents: params.declaredOtherMethodsCents ?? {}
    });

    session.closed_by = params.closedBy;
    session.closed_at_ms = nowMs;
    session.expected_cash_cents = expectedCashCents;
    session.declared_cash_cents = declaredCashCents;
    session.difference_cents = differenceCents;
    session.declared_denominations = { ...params.declaredDenominations };
    session.status = "CLOSED";

    this.enqueueOutboxEvent("cash.session.closed", payload, nowMs);
    this.storage.createSnapshot("AUTO_SHIFT", null, nowMs);
    return session;
  }

  /**
   * HU-058 & HU-209: Reapertura auditada del último turno cerrado si aún no se ha abierto otro turno posterior.
   */
  cmdReopenCashSession(params: {
    cashSessionId: string;
    reopenedBy: string;
    approvalNonce: string;
    reason: string;
    nowMs?: number;
  }): LocalCashSession {
    const nowMs = params.nowMs ?? Date.now();
    const latestSession = this.sessions[this.sessions.length - 1];
    if (!latestSession || latestSession.id !== params.cashSessionId) {
      throw new Error("CANNOT_REOPEN_NON_LATEST_SESSION");
    }
    if (latestSession.status !== "CLOSED") {
      throw new Error("SESSION_NOT_CLOSED");
    }

    const consumed = this.auth.consumeApprovalNonce(
      params.approvalNonce,
      "cash.session.reopen",
      nowMs
    );

    const payload = CashSessionReopenedV1Schema.parse({
      cash_session_id: latestSession.id,
      reopened_by: params.reopenedBy,
      approved_by: consumed.approverId,
      reason: params.reason,
      occurred_at: new Date(nowMs).toISOString()
    });

    latestSession.reopen_history.push({
      previous_declared_cents: latestSession.declared_cash_cents ?? 0,
      previous_difference_cents: latestSession.difference_cents ?? 0,
      reopened_by: consumed.approverId,
      reason: payload.reason,
      at_ms: nowMs
    });
    latestSession.status = "REOPENED";
    latestSession.closed_at_ms = null;

    this.enqueueOutboxEvent("cash.session.reopened", payload, nowMs);
    this.auth.recordAudit(
      "cash.session.reopened",
      params.reopenedBy,
      consumed.approverId,
      latestSession.id,
      { reason: payload.reason },
      nowMs
    );
    return latestSession;
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
