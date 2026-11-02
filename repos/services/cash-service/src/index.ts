/**
 * ÉPICA 09 (FT-09.2) — cash-service: Consolidación de Turnos, Recalculo en Nube y Cierre Forzado Remoto
 * Cubre: HU-086, HU-087, HU-195, HU-302.
 */

export interface CloudCashSessionRecord {
  cash_session_id: string;
  tenant_id: string;
  branch_id: string;
  terminal_id: string;
  cashier_id: string;
  opening_float_cents: number;
  server_expected_cash_cents: number;
  terminal_reported_expected_cents: number | null;
  declared_cash_cents: number | null;
  difference_cents: number | null;
  status: "OPEN" | "CLOSED" | "FORCE_CLOSED";
  review_note: string | null;
  reviewed_by: string | null;
}

export class CashService {
  public readonly sessions = new Map<string, CloudCashSessionRecord>();
  public readonly publishedEvents: { topic: string; payload: unknown }[] = [];

  openSession(params: {
    cashSessionId: string;
    tenantId: string;
    branchId: string;
    terminalId: string;
    cashierId: string;
    openingFloatCents: number;
  }): CloudCashSessionRecord {
    const rec: CloudCashSessionRecord = {
      cash_session_id: params.cashSessionId,
      tenant_id: params.tenantId,
      branch_id: params.branchId,
      terminal_id: params.terminalId,
      cashier_id: params.cashierId,
      opening_float_cents: params.openingFloatCents,
      server_expected_cash_cents: params.openingFloatCents,
      terminal_reported_expected_cents: null,
      declared_cash_cents: null,
      difference_cents: null,
      status: "OPEN",
      review_note: null,
      reviewed_by: null
    };
    this.sessions.set(rec.cash_session_id, rec);
    return rec;
  }

  /**
   * HU-302: Alimenta el efectivo esperado en la nube a partir de ventas, cambios, abonos, retiros y devoluciones.
   */
  applyCashDeltaCents(cashSessionId: string, deltaCents: number): void {
    const s = this.sessions.get(cashSessionId);
    if (!s) throw new Error("CASH_SESSION_NOT_FOUND");
    s.server_expected_cash_cents += deltaCents;
  }

  /**
   * HU-086 & HU-302: Procesa el cierre de turno verificando `server_expected_cash` contra lo reportado
   * por la caja y emitiendo `cash.discrepancy.detected` si hay faltante/sobrante.
   */
  closeSessionAndVerify(params: {
    cashSessionId: string;
    terminalReportedExpectedCents: number;
    declaredCashCents: number;
  }): {
    session: CloudCashSessionRecord;
    discrepancyDetected: boolean;
    integrityMismatchBetweenTerminalAndServer: boolean;
  } {
    const s = this.sessions.get(params.cashSessionId);
    if (!s) throw new Error("CASH_SESSION_NOT_FOUND");

    s.status = "CLOSED";
    s.terminal_reported_expected_cents = params.terminalReportedExpectedCents;
    s.declared_cash_cents = params.declaredCashCents;
    s.difference_cents = params.declaredCashCents - s.server_expected_cash_cents;

    const integrityMismatch = params.terminalReportedExpectedCents !== s.server_expected_cash_cents;
    const discrepancyDetected = s.difference_cents !== 0 || integrityMismatch;

    if (discrepancyDetected) {
      this.publishedEvents.push({
        topic: "cash.events",
        payload: {
          type: "cash.discrepancy.detected",
          data: {
            cash_session_id: s.cash_session_id,
            tenant_id: s.tenant_id,
            server_expected_cash_cents: s.server_expected_cash_cents,
            declared_cash_cents: s.declared_cash_cents,
            difference_cents: s.difference_cents,
            integrity_mismatch: integrityMismatch
          }
        }
      });
    }

    return {
      session: s,
      discrepancyDetected,
      integrityMismatchBetweenTerminalAndServer: integrityMismatch
    };
  }

  /**
   * HU-087: Cierre forzado remoto de un turno olvidado abierto desde la App de Gestión.
   */
  forceCloseSessionRemotely(cashSessionId: string, reason: string, actorId: string): CloudCashSessionRecord {
    const s = this.sessions.get(cashSessionId);
    if (!s) throw new Error("CASH_SESSION_NOT_FOUND");
    s.status = "FORCE_CLOSED";
    s.review_note = `FORCE_CLOSED: ${reason}`;
    s.reviewed_by = actorId;
    this.publishedEvents.push({
      topic: "cash.events",
      payload: {
        type: "cash.session.force_closed",
        data: { cash_session_id: cashSessionId, terminal_id: s.terminal_id, reason }
      }
    });
    return s;
  }

  /**
   * HU-195: Anotación y justificación de descuadres de turno por el administrador.
   */
  annotateDiscrepancyReview(cashSessionId: string, note: string, reviewerId: string): CloudCashSessionRecord {
    const s = this.sessions.get(cashSessionId);
    if (!s) throw new Error("CASH_SESSION_NOT_FOUND");
    s.review_note = note;
    s.reviewed_by = reviewerId;
    return s;
  }
}
