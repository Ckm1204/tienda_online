import { newId, TenantEntitlementsChangedEventSchema } from "@tiendita/contracts";

/**
 * ÉPICA 08 (FT-08.1) — tenant-service: Tiendas, Planes, Add-ons, Sucursales y Entitlements
 * Cubre: HU-072, HU-073, HU-188, HU-189, HU-190, HU-264, HU-265, HU-288, HU-289, HU-331, HU-361.
 */

export type PlanCode = "TENDERO" | "NEGOCIO" | "MULTITIENDA";
export type AddonCode = "EXTRA_TERMINAL" | "EXTRA_BRANCH" | "EXTRA_USERS_5";
export type TenantStatus = "PENDING_ACTIVATION" | "TRIAL" | "ACTIVE" | "PAST_DUE" | "RESTRICTED" | "SUSPENDED" | "CANCELLED";

export interface PlanDefinition {
  code: PlanCode;
  name: string;
  monthly_price_cents: number;
  annual_price_cents: number;
  max_branches: number;
  max_terminals: number;
  max_users: number;
  max_products: number;
  max_credit_customers: number;
  allowed_roles: string[];
  features: Record<string, boolean>;
}

export const DEFAULT_PLANS: Record<PlanCode, PlanDefinition> = {
  TENDERO: {
    code: "TENDERO",
    name: "Plan Tendero",
    monthly_price_cents: 4_990_000, // $49.900 COP
    annual_price_cents: 49_900_000,
    max_branches: 1,
    max_terminals: 1,
    max_users: 2,
    max_products: 3000,
    max_credit_customers: 50,
    allowed_roles: ["OWNER", "CASHIER"],
    features: {
      credit: true,
      promotions: false,
      purchase_orders: false,
      multi_branch: false,
      custom_roles: false,
      export_excel: false
    }
  },
  NEGOCIO: {
    code: "NEGOCIO",
    name: "Plan Negocio",
    monthly_price_cents: 8_990_000, // $89.900 COP
    annual_price_cents: 89_900_000,
    max_branches: 1,
    max_terminals: 2,
    max_users: 7,
    max_products: 15_000,
    max_credit_customers: 500,
    allowed_roles: ["OWNER", "SUPERVISOR", "CASHIER", "INVENTORY", "ACCOUNTANT"],
    features: {
      credit: true,
      promotions: true,
      purchase_orders: true,
      multi_branch: false,
      custom_roles: false,
      export_excel: true
    }
  },
  MULTITIENDA: {
    code: "MULTITIENDA",
    name: "Plan Multi-tienda",
    monthly_price_cents: 16_990_000, // $169.900 COP
    annual_price_cents: 169_900_000,
    max_branches: 3,
    max_terminals: 6,
    max_users: 25,
    max_products: 100_000,
    max_credit_customers: 5000,
    allowed_roles: [
      "OWNER",
      "BRANCH_ADMIN",
      "SUPERVISOR",
      "CASHIER",
      "INVENTORY",
      "ACCOUNTANT"
    ],
    features: {
      credit: true,
      promotions: true,
      purchase_orders: true,
      multi_branch: true,
      custom_roles: true,
      export_excel: true
    }
  }
};

export interface EffectiveEntitlements {
  tenant_id: string;
  plan_code: PlanCode;
  status: TenantStatus;
  max_branches: number;
  max_terminals: number;
  max_users: number;
  max_products: number;
  max_credit_customers: number;
  allowed_roles: string[];
  features: Record<string, boolean>;
}

export interface BranchRecord {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  address: string;
  phone: string | null;
  receipt_header: string | null;
  receipt_footer: string | null;
  default_warehouse_id: string;
  credit_limit_mode: "SOFT" | "ALLOCATED";
  status: "ACTIVE" | "INACTIVE";
}

export interface LegalAcceptanceRecord {
  tenant_id: string;
  user_id: string;
  tos_version: string;
  privacy_policy_version: string;
  dpa_version: string;
  not_obligated_to_invoice_declared: boolean;
  ip_address: string;
  accepted_at_iso: string;
}

export class TenantService {
  public readonly plansCache = new Map<PlanCode, PlanDefinition>(
    Object.entries(DEFAULT_PLANS) as [PlanCode, PlanDefinition][]
  );
  public readonly tenants = new Map<
    string,
    {
      id: string;
      business_name: string;
      nit: string | null;
      plan_code: PlanCode;
      scheduled_downgrade_plan: PlanCode | null;
      terminals_to_retire_on_downgrade: string[];
      status: TenantStatus;
      addons: Record<AddonCode, number>;
      feature_overrides: Record<string, boolean>;
      paid_until_ms: number;
      cancelled_at_ms: number | null;
      legal_acceptance: LegalAcceptanceRecord | null;
    }
  >();
  public readonly statusHistory: {
    tenant_id: string;
    from_status: TenantStatus | null;
    to_status: TenantStatus;
    reason: string;
    actor_id: string;
    occurred_at_ms: number;
  }[] = [];
  public readonly branches = new Map<string, BranchRecord>();
  public readonly publishedEvents: { topic: string; payload: unknown }[] = [];

  /**
   * HU-288: Actualiza un plan en el catálogo e invalida/refresca inmediatamente la caché en memoria.
   */
  updatePlanDefinition(plan: PlanDefinition): void {
    this.plansCache.set(plan.code, { ...plan });
  }

  createTenant(params: {
    tenantId?: string;
    businessName: string;
    nit?: string | null;
    planCode: PlanCode;
    initialStatus?: TenantStatus;
    paidUntilMs?: number;
    actorId: string;
    nowMs?: number;
  }): { tenantId: string; mainBranch: BranchRecord; entitlements: EffectiveEntitlements } {
    const nowMs = params.nowMs ?? Date.now();
    const tenantId = params.tenantId ?? newId(nowMs);
    const status = params.initialStatus ?? "ACTIVE";

    this.tenants.set(tenantId, {
      id: tenantId,
      business_name: params.businessName,
      nit: params.nit ?? null,
      plan_code: params.planCode,
      scheduled_downgrade_plan: null,
      terminals_to_retire_on_downgrade: [],
      status,
      addons: { EXTRA_TERMINAL: 0, EXTRA_BRANCH: 0, EXTRA_USERS_5: 0 },
      feature_overrides: {},
      paid_until_ms: params.paidUntilMs ?? nowMs + 30 * 86_400_000,
      cancelled_at_ms: null,
      legal_acceptance: null
    });

    this.statusHistory.push({
      tenant_id: tenantId,
      from_status: null,
      to_status: status,
      reason: "TENANT_PROVISIONED",
      actor_id: params.actorId,
      occurred_at_ms: nowMs
    });

    const mainBranch: BranchRecord = {
      id: newId(nowMs),
      tenant_id: tenantId,
      code: "PRINCIPAL",
      name: "Sede Principal",
      address: "Calle Principal",
      phone: null,
      receipt_header: params.businessName,
      receipt_footer: "Gracias por su compra",
      default_warehouse_id: newId(nowMs),
      credit_limit_mode: "SOFT",
      status: "ACTIVE"
    };
    this.branches.set(mainBranch.id, mainBranch);

    const entitlements = this.computeEffectiveEntitlements(tenantId);
    this.publishEntitlementsChanged(tenantId);
    return { tenantId, mainBranch, entitlements };
  }

  /**
   * HU-072 & HU-265: Calcula límites efectivos sumando plan base + add-ons + overrides y publica `tenant.entitlements_changed`.
   */
  computeEffectiveEntitlements(tenantId: string): EffectiveEntitlements {
    const t = this.tenants.get(tenantId);
    if (!t) throw new Error("TENANT_NOT_FOUND");
    const plan = this.plansCache.get(t.plan_code)!;

    return {
      tenant_id: tenantId,
      plan_code: t.plan_code,
      status: t.status,
      max_branches: plan.max_branches + (t.addons.EXTRA_BRANCH ?? 0),
      max_terminals: plan.max_terminals + (t.addons.EXTRA_TERMINAL ?? 0),
      max_users: plan.max_users + (t.addons.EXTRA_USERS_5 ?? 0) * 5,
      max_products: plan.max_products,
      max_credit_customers: plan.max_credit_customers,
      allowed_roles: [...plan.allowed_roles],
      features: { ...plan.features, ...t.feature_overrides }
    };
  }

  setAddonQuantity(tenantId: string, addon: AddonCode, qty: number): EffectiveEntitlements {
    const t = this.tenants.get(tenantId);
    if (!t) throw new Error("TENANT_NOT_FOUND");
    t.addons[addon] = Math.max(0, qty);
    return this.publishEntitlementsChanged(tenantId);
  }

  private publishEntitlementsChanged(tenantId: string): EffectiveEntitlements {
    const eff = this.computeEffectiveEntitlements(tenantId);
    const validated = TenantEntitlementsChangedEventSchema.parse({
      tenant_id: eff.tenant_id,
      plan_code: eff.plan_code,
      max_branches: eff.max_branches,
      max_terminals: eff.max_terminals,
      max_users: eff.max_users,
      max_products: eff.max_products,
      max_credit_customers: eff.max_credit_customers,
      allowed_roles: eff.allowed_roles,
      features: eff.features,
      grace_days: 10,
      updated_at: new Date().toISOString()
    });
    this.publishedEvents.push({
      topic: "tenant.events",
      payload: { type: "tenant.entitlements_changed", data: validated }
    });
    return eff;
  }

  /**
   * HU-289: Cambio de estado de tienda insertando automáticamente en `tenant_status_history`.
   */
  changeTenantStatus(params: {
    tenantId: string;
    toStatus: TenantStatus;
    reason: string;
    actorId: string;
    nowMs?: number;
  }): void {
    const nowMs = params.nowMs ?? Date.now();
    const t = this.tenants.get(params.tenantId);
    if (!t) throw new Error("TENANT_NOT_FOUND");
    const fromStatus = t.status;
    t.status = params.toStatus;
    if (params.toStatus === "CANCELLED") {
      t.cancelled_at_ms = nowMs;
    }
    this.statusHistory.push({
      tenant_id: params.tenantId,
      from_status: fromStatus,
      to_status: params.toStatus,
      reason: params.reason,
      actor_id: params.actorId,
      occurred_at_ms: nowMs
    });
    this.publishedEvents.push({
      topic: "tenant.events",
      payload: {
        type: "tenant.status_changed",
        data: { tenant_id: params.tenantId, from_status: fromStatus, to_status: params.toStatus, reason: params.reason }
      }
    });
  }

  /**
   * HU-073 & HU-264: Creación y edición de sucursales validando `max_branches` y creando bodega por defecto.
   */
  createBranch(params: {
    tenantId: string;
    code: string;
    name: string;
    address: string;
    phone?: string;
    receiptHeader?: string;
    receiptFooter?: string;
    nowMs?: number;
  }): BranchRecord {
    const eff = this.computeEffectiveEntitlements(params.tenantId);
    const activeBranches = [...this.branches.values()].filter(
      (b) => b.tenant_id === params.tenantId && b.status === "ACTIVE"
    );
    if (activeBranches.length >= eff.max_branches) {
      throw new Error("403 PLAN_LIMIT_REACHED:max_branches");
    }

    const nowMs = params.nowMs ?? Date.now();
    const branch: BranchRecord = {
      id: newId(nowMs),
      tenant_id: params.tenantId,
      code: params.code,
      name: params.name,
      address: params.address,
      phone: params.phone ?? null,
      receipt_header: params.receiptHeader ?? params.name,
      receipt_footer: params.receiptFooter ?? "Gracias por su compra",
      default_warehouse_id: newId(nowMs),
      credit_limit_mode: "SOFT",
      status: "ACTIVE"
    };
    this.branches.set(branch.id, branch);
    this.publishedEvents.push({
      topic: "tenant.events",
      payload: { type: "branch.created", data: branch }
    });
    return branch;
  }

  updateBranch(
    tenantId: string,
    branchId: string,
    patch: Partial<Pick<BranchRecord, "name" | "address" | "phone" | "receipt_header" | "receipt_footer" | "credit_limit_mode">>
  ): BranchRecord {
    const b = this.branches.get(branchId);
    if (!b || b.tenant_id !== tenantId) throw new Error("BRANCH_NOT_FOUND");
    Object.assign(b, patch);
    this.publishedEvents.push({
      topic: "tenant.events",
      payload: { type: "branch.updated", data: b }
    });
    return b;
  }

  /**
   * HU-189: Upgrade inmediato con prorrateo y Downgrade diferido al fin de ciclo exigiendo elegir cajas a retirar.
   */
  changePlan(params: {
    tenantId: string;
    targetPlan: PlanCode;
    currentActiveTerminalsCount: number;
    terminalsToRetireAtPeriodEnd?: string[];
    remainingDaysInCycle?: number;
  }): {
    mode: "IMMEDIATE_UPGRADE" | "SCHEDULED_DOWNGRADE";
    proratedChargeCents: number;
    entitlements: EffectiveEntitlements;
  } {
    const t = this.tenants.get(params.tenantId);
    if (!t) throw new Error("TENANT_NOT_FOUND");

    const curPlan = this.plansCache.get(t.plan_code)!;
    const nextPlan = this.plansCache.get(params.targetPlan)!;

    if (nextPlan.monthly_price_cents >= curPlan.monthly_price_cents) {
      const remDays = params.remainingDaysInCycle ?? 15;
      const diffCents = nextPlan.monthly_price_cents - curPlan.monthly_price_cents;
      const prorated = Math.round((diffCents * remDays) / 30);
      t.plan_code = params.targetPlan;
      t.scheduled_downgrade_plan = null;
      const entitlements = this.publishEntitlementsChanged(params.tenantId);
      return {
        mode: "IMMEDIATE_UPGRADE",
        proratedChargeCents: prorated,
        entitlements
      };
    }

    // Downgrade diferido: verificar si sobran cajas activas
    const targetMaxTerminals = nextPlan.max_terminals + (t.addons.EXTRA_TERMINAL ?? 0);
    const excessTerminals = Math.max(0, params.currentActiveTerminalsCount - targetMaxTerminals);
    const retiredList = params.terminalsToRetireAtPeriodEnd ?? [];
    if (excessTerminals > 0 && retiredList.length < excessTerminals) {
      throw new Error(`DOWNGRADE_REQUIRES_SELECTING_TERMINALS_TO_RETIRE:${excessTerminals}`);
    }

    t.scheduled_downgrade_plan = params.targetPlan;
    t.terminals_to_retire_on_downgrade = retiredList;
    return {
      mode: "SCHEDULED_DOWNGRADE",
      proratedChargeCents: 0,
      entitlements: this.computeEffectiveEntitlements(params.tenantId)
    };
  }

  /**
   * HU-361: Versionado y aceptación obligatoria de Términos, Política de Datos (Ley 1581) y DPA.
   */
  recordLegalAcceptance(params: {
    tenantId: string;
    userId: string;
    tosAccepted: boolean;
    privacyAccepted: boolean;
    dpaAccepted: boolean;
    notObligatedDeclared: boolean;
    ipAddress: string;
    nowIso?: string;
  }): LegalAcceptanceRecord {
    if (!params.tosAccepted || !params.privacyAccepted || !params.dpaAccepted) {
      throw new Error("LEGAL_ACCEPTANCE_REQUIRED");
    }
    const t = this.tenants.get(params.tenantId);
    if (!t) throw new Error("TENANT_NOT_FOUND");
    const rec: LegalAcceptanceRecord = {
      tenant_id: params.tenantId,
      user_id: params.userId,
      tos_version: "2026.1",
      privacy_policy_version: "2026.1",
      dpa_version: "2026.1",
      not_obligated_to_invoice_declared: params.notObligatedDeclared,
      ip_address: params.ipAddress,
      accepted_at_iso: params.nowIso ?? new Date().toISOString()
    };
    t.legal_acceptance = rec;
    return rec;
  }

  /**
   * HU-190: Exportación completa de datos del tenant dentro de los 90 días posteriores a CANCELLED.
   */
  requestFullTenantExport(tenantId: string, nowMs = Date.now()): { downloadUrl: string; expiresInSeconds: number } {
    const t = this.tenants.get(tenantId);
    if (!t) throw new Error("TENANT_NOT_FOUND");
    if (t.cancelled_at_ms !== null && nowMs - t.cancelled_at_ms > 90 * 86_400_000) {
      throw new Error("RETENTION_WINDOW_EXPIRED");
    }
    return {
      downloadUrl: `https://s3.tiendita.local/exports/${tenantId}/full-archive-${nowMs}.zip`,
      expiresInSeconds: 3600
    };
  }
}


export * from "./platform-and-billing.js";
