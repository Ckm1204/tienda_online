import { newId } from "@tiendita/contracts";

/**
 * ÉPICA 09 (FT-09.4) — customer-service: Cartera Consolidada, Cupo ALLOCATED, Castigos y Derechos ARCO
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

export class CustomerService {
  private readonly inboxProcessed = new Set<string>();
  public readonly tenantMaxCreditCustomers = new Map<string, number>();
  public readonly customers = new Map<string, CloudCustomerRecord>();
  public readonly movements: CloudCreditMovementRecord[] = [];
  public readonly publishedEvents: { topic: string; payload: unknown }[] = [];

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
      anonymized: false
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
}
