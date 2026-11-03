import {
  type PlatformBillingAndDunningService,
  type TenantService,
  type PlanCode,
  type TenantStatus
} from "@tiendita/tenant-service";
import type { IdentityService } from "@tiendita/identity-service";
import type { DeviceService } from "@tiendita/device-service";
import type { HttpRequest, HttpResponse } from "../types.js";

export interface PlatformControllerDependencies {
  tenantService: TenantService;
  platformBillingService: PlatformBillingAndDunningService;
  identityService: IdentityService;
  deviceService: DeviceService;
}

export class PlatformController {
  private readonly tenantService: TenantService;
  private readonly platformBillingService: PlatformBillingAndDunningService;
  private readonly identityService: IdentityService;
  private readonly deviceService: DeviceService;

  constructor(deps: PlatformControllerDependencies) {
    this.tenantService = deps.tenantService;
    this.platformBillingService = deps.platformBillingService;
    this.identityService = deps.identityService;
    this.deviceService = deps.deviceService;
  }

  private assertSuperAdmin(req: HttpRequest): void {
    const claims = req.claims;
    if (!claims) {
      throw new Error("401 UNAUTHORIZED");
    }
    const isSuperAdmin =
      claims.aud === "platform" ||
      claims.roles.includes("SUPER_ADMIN") ||
      ((claims as unknown) as Record<string, unknown>).role === "SUPER_ADMIN";

    if (!isSuperAdmin) {
      throw new Error("403 FORBIDDEN_SUPER_ADMIN_REQUIRED");
    }
  }

  /**
   * HU-111, HU-261..HU-263
   * POST /v1/platform/tenants: Saga orquestada de creación de tienda
   */
  async createTenant(req: HttpRequest, nowMs: number): Promise<HttpResponse> {
    this.assertSuperAdmin(req);
    const body = (typeof req.body === "object" && req.body !== null ? req.body : {}) as {
      businessName?: string;
      documentType?: "CC" | "NIT" | "CE" | "PPT";
      documentNumber?: string;
      nitDv?: number;
      planCode?: PlanCode;
      ownerEmail?: string;
      ownerPhone?: string;
      trialDays?: number;
    };

    if (!body.businessName || !body.documentType || !body.documentNumber || !body.planCode || !body.ownerEmail) {
      return {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: { error: "MISSING_FIELDS", detail: "businessName, documentType, documentNumber, planCode and ownerEmail are required" }
      };
    }

    try {
      const sagaResult = await this.platformBillingService.orchestrateCreateTenantSaga({
        businessName: body.businessName,
        documentType: body.documentType,
        documentNumber: body.documentNumber,
        nitDv: body.nitDv,
        planCode: body.planCode,
        ownerEmail: body.ownerEmail,
        ownerPhone: body.ownerPhone,
        trialDays: body.trialDays ?? 15,
        actorId: req.claims?.sub ?? "super-admin",
        nowMs
      });

      // Configurar entitlements en identityService y deviceService
      const planDef = this.tenantService.plansCache.get(body.planCode);
      if (planDef) {
        this.identityService.applyTenantEntitlementsChanged({
          tenant_id: sagaResult.tenantId,
          max_users: planDef.max_users,
          allowed_roles: planDef.allowed_roles,
          features: planDef.features
        });
        this.deviceService.tenantMaxTerminals.set(sagaResult.tenantId, planDef.max_terminals);
      }

      // Crear usuario OWNER en identityService
      const ownerUser = this.identityService.createStoreUser({
        tenantId: sagaResult.tenantId,
        fullName: body.businessName,
        email: body.ownerEmail,
        roleCode: "OWNER",
        branchId: sagaResult.mainBranchId,
        nowMs
      });

      // Enrolar terminal inicial CAJA-01 en deviceService
      const branchRecord = this.tenantService.branches.get(sagaResult.mainBranchId);
      const defaultWarehouseId = branchRecord?.default_warehouse_id ?? `wh-${sagaResult.tenantId}`;
      const initialTerminal = this.deviceService.createTerminal({
        tenantId: sagaResult.tenantId,
        branchId: sagaResult.mainBranchId,
        warehouseId: defaultWarehouseId,
        code: sagaResult.terminalCode,
        receiptPrefix: "POS",
        nowMs
      });

      return {
        status: 201,
        headers: { "Content-Type": "application/json" },
        body: {
          tenantId: sagaResult.tenantId,
          mainBranchId: sagaResult.mainBranchId,
          terminalId: initialTerminal.id,
          terminalCode: initialTerminal.code,
          ownerUserId: ownerUser.id,
          activationToken: sagaResult.activationToken,
          status: "TRIAL"
        }
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.startsWith("400")) {
        return {
          status: 400,
          headers: { "Content-Type": "application/json" },
          body: { error: "SAGA_VALIDATION_ERROR", detail: message }
        };
      }
      return {
        status: 500,
        headers: { "Content-Type": "application/json" },
        body: { error: "SAGA_EXECUTION_FAILED", detail: message }
      };
    }
  }

  /**
   * HU-251 & HU-405
   * GET /v1/platform/tenants: Directorio y buscador de tiendas
   */
  async listTenants(req: HttpRequest, _nowMs: number, queryParams: URLSearchParams): Promise<HttpResponse> {
    this.assertSuperAdmin(req);
    const q = (queryParams.get("q") ?? "").toLowerCase().trim();
    const plan = queryParams.get("plan") as PlanCode | null;
    const status = queryParams.get("status") as TenantStatus | null;

    let items = [...this.tenantService.tenants.values()];

    if (q) {
      items = items.filter(
        (t) =>
          t.business_name.toLowerCase().includes(q) ||
          (t.nit?.toLowerCase() ?? "").includes(q) ||
          t.id.toLowerCase().includes(q)
      );
    }

    if (plan) {
      items = items.filter((t) => t.plan_code === plan);
    }

    if (status) {
      items = items.filter((t) => t.status === status);
    }

    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: {
        tenants: items.map((t) => ({
          id: t.id,
          businessName: t.business_name,
          nit: t.nit,
          planCode: t.plan_code,
          status: t.status,
          paidUntilMs: t.paid_until_ms
        }))
      }
    };
  }

  /**
   * HU-251: Vista 360° de tienda
   * GET /v1/platform/tenants/:id
   */
  async getTenant360(req: HttpRequest, _nowMs: number, tenantId: string): Promise<HttpResponse> {
    this.assertSuperAdmin(req);
    const tenant = this.tenantService.tenants.get(tenantId);
    if (!tenant) {
      return {
        status: 404,
        headers: { "Content-Type": "application/json" },
        body: { error: "TENANT_NOT_FOUND", tenantId }
      };
    }

    const branches = [...this.tenantService.branches.values()].filter((b) => b.tenant_id === tenantId);
    const terminals = [...this.deviceService.terminals.values()].filter((tm) => tm.tenant_id === tenantId);
    const invoices = [...this.platformBillingService.invoices.values()].filter((inv) => inv.tenantId === tenantId);
    const graceExtensions = this.platformBillingService.graceExtensions.filter((g) => g.tenantId === tenantId);

    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: {
        tenant: {
          id: tenant.id,
          businessName: tenant.business_name,
          nit: tenant.nit,
          planCode: tenant.plan_code,
          status: tenant.status,
          paidUntilMs: tenant.paid_until_ms
        },
        branches: branches.map((b) => ({ id: b.id, name: b.name, isMain: b.code === "MAIN", code: b.code })),
        terminals: terminals.map((tm) => ({ id: tm.id, code: tm.code, status: tm.status, branchId: tm.branch_id })),
        invoices,
        graceExtensions
      }
    };
  }

  /**
   * HU-405: Suspensión de tienda
   * POST /v1/platform/tenants/:id/suspend
   */
  async suspendTenant(req: HttpRequest, nowMs: number, tenantId: string): Promise<HttpResponse> {
    this.assertSuperAdmin(req);
    const body = (typeof req.body === "object" && req.body !== null ? req.body : {}) as { reason?: string };

    try {
      this.tenantService.changeTenantStatus({
        tenantId,
        toStatus: "SUSPENDED",
        reason: body.reason ?? "Suspensión administrativa por super admin",
        actorId: req.claims?.sub ?? "super-admin",
        nowMs
      });
      const updated = this.tenantService.tenants.get(tenantId)!;

      return {
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: { success: true, tenantId: updated.id, status: updated.status }
      };
    } catch {
      return {
        status: 404,
        headers: { "Content-Type": "application/json" },
        body: { error: "TENANT_NOT_FOUND", tenantId }
      };
    }
  }

  /**
   * HU-405: Reactivación de tienda
   * POST /v1/platform/tenants/:id/reactivate
   */
  async reactivateTenant(req: HttpRequest, nowMs: number, tenantId: string): Promise<HttpResponse> {
    this.assertSuperAdmin(req);
    const body = (typeof req.body === "object" && req.body !== null ? req.body : {}) as { reason?: string };

    try {
      this.tenantService.changeTenantStatus({
        tenantId,
        toStatus: "ACTIVE",
        reason: body.reason ?? "Reactivación administrativa por super admin",
        actorId: req.claims?.sub ?? "super-admin",
        nowMs
      });
      const updated = this.tenantService.tenants.get(tenantId)!;

      return {
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: { success: true, tenantId: updated.id, status: updated.status }
      };
    } catch {
      return {
        status: 404,
        headers: { "Content-Type": "application/json" },
        body: { error: "TENANT_NOT_FOUND", tenantId }
      };
    }
  }

  /**
   * HU-118 & HU-291: Conceder prórroga de pago (máximo 2/año por hasta 7 días)
   * POST /v1/platform/tenants/:id/grace-extensions
   */
  async grantGraceExtension(req: HttpRequest, nowMs: number, tenantId: string): Promise<HttpResponse> {
    this.assertSuperAdmin(req);
    const body = (typeof req.body === "object" && req.body !== null ? req.body : {}) as {
      invoiceId?: string;
      days?: number;
      reason?: string;
    };

    if (!body.invoiceId || !body.days || !body.reason) {
      return {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: { error: "MISSING_FIELDS", detail: "invoiceId, days, and reason are required" }
      };
    }

    try {
      const extension = this.platformBillingService.grantGraceExtension({
        tenantId,
        invoiceId: body.invoiceId,
        days: body.days,
        reason: body.reason,
        actorId: req.claims?.sub ?? "super-admin",
        nowMs
      });

      return {
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: { success: true, extension }
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: { error: "GRACE_EXTENSION_FAILED", detail: message }
      };
    }
  }

  /**
   * HU-250: Dashboard global del Super Admin (MRR, estados y salud)
   * GET /v1/platform/metrics
   */
  async getMetrics(req: HttpRequest, _nowMs: number): Promise<HttpResponse> {
    this.assertSuperAdmin(req);
    const metrics = this.platformBillingService.getGlobalDashboardMetrics();
    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: metrics
    };
  }

  /**
   * HU-115..HU-117 & HU-489: Ejecución del evaluador de mora (Dunning Scheduler)
   * POST /v1/platform/dunning/evaluate
   */
  async evaluateDunning(req: HttpRequest, nowMs: number): Promise<HttpResponse> {
    this.assertSuperAdmin(req);
    const result = this.platformBillingService.runDailyDunningEvaluation(nowMs);
    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: result
    };
  }

  /**
   * HU-113 & HU-406: Facturas de suscripción SaaS
   * GET /v1/platform/billing/invoices
   */
  async listInvoices(req: HttpRequest, _nowMs: number, queryParams: URLSearchParams): Promise<HttpResponse> {
    this.assertSuperAdmin(req);
    const status = queryParams.get("status");
    const tenantId = queryParams.get("tenant_id") || queryParams.get("tenantId");

    let invoices = [...this.platformBillingService.invoices.values()];
    if (status) {
      invoices = invoices.filter((i) => i.status === status);
    }
    if (tenantId) {
      invoices = invoices.filter((i) => i.tenantId === tenantId);
    }

    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: { invoices }
    };
  }

  /**
   * HU-114: Registro de pago manual
   * POST /v1/platform/billing/invoices/:id/manual-payment
   */
  async recordManualPayment(req: HttpRequest, nowMs: number, invoiceId: string): Promise<HttpResponse> {
    this.assertSuperAdmin(req);
    const body = (typeof req.body === "object" && req.body !== null ? req.body : {}) as {
      paymentMethod?: "NEQUI" | "DAVIPLATA" | "BANCOLOMBIA" | "CASH";
      proofUrl?: string;
    };

    if (!body.paymentMethod || !body.proofUrl) {
      return {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: { error: "MISSING_FIELDS", detail: "paymentMethod and proofUrl are required" }
      };
    }

    try {
      const res = this.platformBillingService.recordManualPayment({
        invoiceId,
        paymentMethod: body.paymentMethod,
        proofUrl: body.proofUrl,
        actorId: req.claims?.sub ?? "super-admin",
        nowMs
      });

      return {
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: res
      };
    } catch {
      return {
        status: 404,
        headers: { "Content-Type": "application/json" },
        body: { error: "INVOICE_NOT_FOUND", invoiceId }
      };
    }
  }

  /**
   * HU-121: Emisión de serial de Edición Local
   * POST /v1/platform/local-licenses
   */
  async issueLocalLicense(req: HttpRequest, nowMs: number): Promise<HttpResponse> {
    this.assertSuperAdmin(req);
    const body = (typeof req.body === "object" && req.body !== null ? req.body : {}) as {
      customerName?: string;
      customerNitOrCc?: string;
      customerPhone?: string;
      edition?: "LOCAL_ESENCIAL" | "LOCAL_PLUS";
      receiptPrefix?: string;
    };

    if (!body.customerName || !body.customerNitOrCc || !body.customerPhone) {
      return {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: { error: "MISSING_FIELDS", detail: "customerName, customerNitOrCc and customerPhone are required" }
      };
    }

    const license = this.deviceService.issueLocalEditionSerialKey({
      customerName: body.customerName,
      customerNitOrCc: body.customerNitOrCc,
      customerPhone: body.customerPhone,
      edition: body.edition ?? "LOCAL_PLUS",
      receiptPrefix: body.receiptPrefix ?? "L01",
      nowMs
    });

    return {
      status: 201,
      headers: { "Content-Type": "application/json" },
      body: {
        license: {
          id: license.id,
          serialKey: license.serial_key, // Visible solo en emisión
          serialLast4: license.serial_last4,
          edition: license.edition,
          customerName: license.customer_name,
          customerNitOrCc: license.customer_nit_or_cc,
          status: license.status,
          updatesUntilMs: license.updates_until_ms
        }
      }
    };
  }

  /**
   * HU-121: Listado de licencias de Edición Local (ocultando el serial_key en texto plano)
   * GET /v1/platform/local-licenses
   */
  async listLocalLicenses(req: HttpRequest): Promise<HttpResponse> {
    this.assertSuperAdmin(req);
    const licenses = [...this.deviceService.localEditionLicenses.values()].map((lic) => ({
      id: lic.id,
      serialLast4: lic.serial_last4,
      edition: lic.edition,
      customerName: lic.customer_name,
      customerNitOrCc: lic.customer_nit_or_cc,
      status: lic.status,
      activatedAtMs: lic.activated_at_ms,
      updatesUntilMs: lic.updates_until_ms,
      transfersUsed: lic.transfers_used
    }));

    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: { licenses }
    };
  }

  /**
   * HU-112: Acceso temporal de soporte Just-In-Time (JIT 30 min)
   * POST /v1/platform/support-access
   */
  async grantJitSupportAccess(req: HttpRequest, nowMs: number): Promise<HttpResponse> {
    this.assertSuperAdmin(req);
    const body = (typeof req.body === "object" && req.body !== null ? req.body : {}) as {
      tenantId?: string;
      reason?: string;
    };

    if (!body.tenantId || !body.reason) {
      return {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: { error: "MISSING_FIELDS", detail: "tenantId and reason are required" }
      };
    }

    const session = this.platformBillingService.grantJustInTimeSupportSession({
      tenantId: body.tenantId,
      actorId: req.claims?.sub ?? "super-admin",
      reason: body.reason,
      nowMs
    });

    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: { session }
    };
  }
}
