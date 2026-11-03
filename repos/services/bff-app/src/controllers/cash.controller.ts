import type { CashService } from "@tiendita/cash-service";
import type { HttpRequest, HttpResponse } from "../types.js";
import { requirePermission } from "../middlewares/gateway-security.js";

/**
 * ÉPICA 09 (FT-09.2) & ÉPICA 05 — Controlador de Turnos y Arqueos de Caja en Nube
 * Cubre: HU-086, HU-087, HU-195, HU-302.
 */
export class CashController {
  constructor(private readonly cashService: CashService) {}

  /**
   * HU-086: Listado de turnos de caja y estado de arqueos/descuadres.
   */
  async listSessions(req: HttpRequest, queryParams: URLSearchParams): Promise<HttpResponse> {
    const claims = req.claims!;
    requirePermission(claims, "terminal.read");
    const tenantId = claims.tid!;
    const statusFilter = queryParams.get("status");
    const branchId = queryParams.get("branchId");
    const terminalId = queryParams.get("terminalId");

    const allSessions = [...this.cashService.sessions.values()]
      .filter((s) => {
        if (s.tenant_id !== tenantId) return false;
        if (statusFilter && s.status !== statusFilter) return false;
        if (branchId && s.branch_id !== branchId) return false;
        if (terminalId && s.terminal_id !== terminalId) return false;
        return true;
      })
      .map((s) => ({
        id: s.cash_session_id,
        tenantId: s.tenant_id,
        branchId: s.branch_id,
        terminalId: s.terminal_id,
        cashierId: s.cashier_id,
        openingFloatCents: s.opening_float_cents,
        serverExpectedCashCents: s.server_expected_cash_cents,
        terminalReportedExpectedCents: s.terminal_reported_expected_cents,
        declaredCashCents: s.declared_cash_cents,
        differenceCents: s.difference_cents,
        status: s.status,
        reviewNote: s.review_note,
        reviewedBy: s.reviewed_by
      }));

    const openCount = allSessions.filter((s) => s.status === "OPEN").length;
    const closedCount = allSessions.filter((s) => s.status === "CLOSED").length;
    const forceClosedCount = allSessions.filter((s) => s.status === "FORCE_CLOSED").length;
    const totalDiscrepancyCents = allSessions.reduce((acc, s) => acc + (s.differenceCents ?? 0), 0);

    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: {
        totalSessions: allSessions.length,
        openCount,
        closedCount,
        forceClosedCount,
        totalDiscrepancyCents,
        items: allSessions
      }
    };
  }

  /**
   * HU-053: Apertura de turno con base de caja inicial.
   */
  async openSession(req: HttpRequest): Promise<HttpResponse> {
    const claims = req.claims!;
    requirePermission(claims, "terminal.manage");
    const { cashSessionId, branchId, terminalId, cashierId, openingFloatCents } = (req.body as any) || {};

    if (!cashSessionId || !branchId || !terminalId || !cashierId) {
      return {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: { error: "MISSING_REQUIRED_FIELDS", message: "cashSessionId, branchId, terminalId, and cashierId are required" }
      };
    }

    if (typeof openingFloatCents !== "number" || openingFloatCents < 0) {
      return {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: { error: "INVALID_OPENING_FLOAT", message: "openingFloatCents must be a non-negative number" }
      };
    }

    try {
      const rec = this.cashService.openSession({
        cashSessionId,
        tenantId: claims.tid!,
        branchId,
        terminalId,
        cashierId,
        openingFloatCents
      });

      return {
        status: 201,
        headers: { "Content-Type": "application/json" },
        body: {
          success: true,
          session: {
            id: rec.cash_session_id,
            status: rec.status,
            openingFloatCents: rec.opening_float_cents,
            serverExpectedCashCents: rec.server_expected_cash_cents
          }
        }
      };
    } catch (err: any) {
      return {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: { error: err.message || "OPEN_SESSION_FAILED" }
      };
    }
  }

  /**
   * HU-086 & HU-302: Cierre de turno y verificación de arqueo ciego contra esperado en servidor.
   */
  async closeSession(cashSessionId: string, req: HttpRequest): Promise<HttpResponse> {
    const claims = req.claims!;
    requirePermission(claims, "terminal.manage");
    const { terminalReportedExpectedCents, declaredCashCents } = (req.body as any) || {};

    if (typeof terminalReportedExpectedCents !== "number" || typeof declaredCashCents !== "number") {
      return {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: { error: "INVALID_AMOUNTS", message: "terminalReportedExpectedCents and declaredCashCents are required numbers" }
      };
    }

    try {
      const res = this.cashService.closeSessionAndVerify({
        cashSessionId,
        terminalReportedExpectedCents,
        declaredCashCents
      });

      return {
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: {
          success: true,
          session: {
            id: res.session.cash_session_id,
            status: res.session.status,
            serverExpectedCashCents: res.session.server_expected_cash_cents,
            terminalReportedExpectedCents: res.session.terminal_reported_expected_cents,
            declaredCashCents: res.session.declared_cash_cents,
            differenceCents: res.session.difference_cents
          },
          discrepancyDetected: res.discrepancyDetected,
          integrityMismatch: res.integrityMismatchBetweenTerminalAndServer
        }
      };
    } catch (err: any) {
      return {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: { error: err.message || "CLOSE_SESSION_FAILED" }
      };
    }
  }

  /**
   * HU-087: Cierre forzado remoto de un turno olvidado por el cajero.
   */
  async forceCloseSession(cashSessionId: string, req: HttpRequest): Promise<HttpResponse> {
    const claims = req.claims!;
    requirePermission(claims, "terminal.manage");
    const { reason } = (req.body as any) || {};

    if (!reason || typeof reason !== "string" || reason.trim().length < 3) {
      return {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: { error: "INVALID_REASON", message: "reason is required with minimum 3 characters" }
      };
    }

    try {
      const rec = this.cashService.forceCloseSessionRemotely(cashSessionId, reason.trim(), claims.sub);
      return {
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: {
          success: true,
          session: {
            id: rec.cash_session_id,
            status: rec.status,
            reviewNote: rec.review_note,
            reviewedBy: rec.reviewed_by
          }
        }
      };
    } catch (err: any) {
      return {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: { error: err.message || "FORCE_CLOSE_FAILED" }
      };
    }
  }

  /**
   * HU-195: Anotación y justificación de descuadres de turno por supervisor/dueño.
   */
  async reviewDiscrepancy(cashSessionId: string, req: HttpRequest): Promise<HttpResponse> {
    const claims = req.claims!;
    requirePermission(claims, "terminal.manage");
    const { note } = (req.body as any) || {};

    if (!note || typeof note !== "string" || note.trim().length < 3) {
      return {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: { error: "INVALID_NOTE", message: "note is required with minimum 3 characters" }
      };
    }

    try {
      const rec = this.cashService.annotateDiscrepancyReview(cashSessionId, note.trim(), claims.sub);
      return {
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: {
          success: true,
          session: {
            id: rec.cash_session_id,
            reviewNote: rec.review_note,
            reviewedBy: rec.reviewed_by
          }
        }
      };
    } catch (err: any) {
      return {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: { error: err.message || "REVIEW_NOTE_FAILED" }
      };
    }
  }
}
