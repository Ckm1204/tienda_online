import { CircuitBreaker } from "@tiendita/service-kit";
import { TenantService } from "@tiendita/tenant-service";
import { IdentityService } from "@tiendita/identity-service";
import { DeviceService } from "@tiendita/device-service";
import { CatalogService } from "@tiendita/catalog-service";
import { SalesService } from "@tiendita/sales-service";
import { CashService } from "@tiendita/cash-service";
import { InventoryService } from "@tiendita/inventory-service";
import { CustomerService } from "@tiendita/customer-service";
import { AuditService } from "@tiendita/audit-service";

import type { HttpRequest, HttpResponse, BffAppDependencies } from "./types.js";
import { RateLimiter } from "./middlewares/rate-limiter.js";
import { IdempotencyStore } from "./middlewares/idempotency.js";
import { ShortReportCache } from "./cache/report-cache.js";
import {
  DEFAULT_ALLOWED_ORIGINS,
  buildCorsHeaders,
  checkPayloadSizeLimit
} from "./middlewares/gateway-security.js";
import { BffRouter } from "./router.js";

import { AuthController } from "./controllers/auth.controller.js";
import { BootstrapController } from "./controllers/bootstrap.controller.js";
import { ReportsController } from "./controllers/reports.controller.js";
import { TerminalsController } from "./controllers/terminals.controller.js";
import { UsersController } from "./controllers/users.controller.js";
import { CatalogController } from "./controllers/catalog.controller.js";
import { InventoryController } from "./controllers/inventory.controller.js";
import { SalesController } from "./controllers/sales.controller.js";
import { CustomersController } from "./controllers/customers.controller.js";

export class BffApp {
  public readonly tenantService: TenantService;
  public readonly identityService: IdentityService;
  public readonly deviceService: DeviceService;
  public readonly catalogService: CatalogService;
  public readonly salesService: SalesService;
  public readonly cashService: CashService;
  public readonly inventoryService: InventoryService;
  public readonly customerService: CustomerService;
  public readonly auditService: AuditService;

  public readonly rateLimiter = new RateLimiter();
  public readonly idempotencyStore = new IdempotencyStore();
  public readonly reportCache = new ShortReportCache();
  public readonly breakers = new Map<string, CircuitBreaker>();

  public isShuttingDown = false;
  public allowedCorsOrigins: string[] = [...DEFAULT_ALLOWED_ORIGINS];

  private readonly router: BffRouter;

  constructor(deps: BffAppDependencies = {}) {
    this.tenantService = deps.tenantService ?? new TenantService();
    this.identityService = deps.identityService ?? new IdentityService();
    this.deviceService = deps.deviceService ?? new DeviceService();
    this.catalogService = deps.catalogService ?? new CatalogService();
    this.salesService = deps.salesService ?? new SalesService();
    this.cashService = deps.cashService ?? new CashService();
    this.inventoryService = deps.inventoryService ?? new InventoryService();
    this.customerService = deps.customerService ?? new CustomerService();
    this.auditService = deps.auditService ?? new AuditService();

    // Circuit breakers por servicio
    this.breakers.set("tenant-service", new CircuitBreaker({ name: "tenant-service" }));
    this.breakers.set("identity-service", new CircuitBreaker({ name: "identity-service" }));
    this.breakers.set("device-service", new CircuitBreaker({ name: "device-service" }));
    this.breakers.set("catalog-service", new CircuitBreaker({ name: "catalog-service" }));
    this.breakers.set("audit-service", new CircuitBreaker({ name: "audit-service" }));

    // Instanciar controladores modulares
    const authController = new AuthController(this.identityService, this.deviceService);
    const bootstrapController = new BootstrapController(this.identityService, this.tenantService);
    const reportsController = new ReportsController(
      this.salesService,
      this.reportCache,
      (name) => this.getBreaker(name)
    );
    const terminalsController = new TerminalsController(this.deviceService);
    const usersController = new UsersController(this.identityService);
    const catalogController = new CatalogController(this.catalogService, this.reportCache);
    const inventoryController = new InventoryController(this.inventoryService);
    const salesController = new SalesController(this.salesService);
    const customersController = new CustomersController(this.customerService);

    this.router = new BffRouter({
      authController,
      bootstrapController,
      reportsController,
      terminalsController,
      usersController,
      catalogController,
      inventoryController,
      salesController,
      customersController
    });
  }

  getBreaker(name: string): CircuitBreaker {
    let b = this.breakers.get(name);
    if (!b) {
      b = new CircuitBreaker({ name });
      this.breakers.set(name, b);
    }
    return b;
  }

  /**
   * Manejador central HTTP con cadena de middlewares:
   * 1. CORS
   * 2. Payload size limits (HU-181)
   * 3. Liveness/Readiness
   * 4. Rate Limiting (HU-182)
   * 5. Idempotency Check (HU-183)
   * 6. Router Dispatching con mapeo de errores
   * 7. Idempotency Cache Write
   * 8. Async Audit Logging (*.admin_action) (HU-319)
   */
  async handleRequest(req: HttpRequest, nowMs = Date.now()): Promise<HttpResponse> {
    const corsHeaders = buildCorsHeaders(req.origin, this.allowedCorsOrigins);

    if (req.method === "OPTIONS") {
      return { status: 204, headers: corsHeaders, body: null };
    }

    // HU-181: Verificación de límite de tamaño de payload
    const payloadError = checkPayloadSizeLimit(req, corsHeaders);
    if (payloadError) {
      return payloadError;
    }

    // Healthcheck /health/ready
    if (req.path === "/health/ready") {
      if (this.isShuttingDown) {
        return {
          status: 503,
          headers: { ...corsHeaders, "Cache-Control": "no-store", "Content-Type": "application/json" },
          body: { status: "shutting_down", service: "bff-app" }
        };
      }
      return {
        status: 200,
        headers: { ...corsHeaders, "Cache-Control": "no-store", "Content-Type": "application/json" },
        body: { status: "ok", service: "bff-app" }
      };
    }

    // HU-182: Rate Limiting
    const rateKind = !req.claims ? "anonymous" : req.claims.aud === "pos-device" ? "pos-device" : "mgmt-app";
    const rateKey = req.claims ? `user:${req.claims.sub}` : `ip:${req.ip}`;
    const rateResult = this.rateLimiter.check(rateKey, rateKind, nowMs);
    if (!rateResult.allowed) {
      return {
        status: 429,
        headers: {
          ...corsHeaders,
          "Retry-After": String(rateResult.retryAfterSeconds ?? 60),
          "Content-Type": "application/json"
        },
        body: { error: "Too Many Requests", retryAfterSeconds: rateResult.retryAfterSeconds }
      };
    }

    // HU-183: Idempotencia para mutaciones POST, PATCH, PUT, DELETE
    const idempotencyKey = req.headers["idempotency-key"] || req.headers["Idempotency-Key"];
    const isMutation = ["POST", "PATCH", "PUT", "DELETE"].includes(req.method);
    if (isMutation && idempotencyKey) {
      const cached = this.idempotencyStore.get(idempotencyKey, nowMs);
      if (cached) {
        return {
          status: cached.status,
          headers: { ...cached.headers, ...corsHeaders, "X-Cache-Lookup": "HIT_IDEMPOTENCY" },
          body: cached.body
        };
      }
    }

    // Despacho a través del Router
    let response: HttpResponse;
    try {
      response = await this.router.route(req, nowMs);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.startsWith("403")) {
        const parts = message.split(" ");
        response = {
          status: 403,
          headers: { "Content-Type": "application/json" },
          body: { error: "Forbidden", code: parts[1] ?? "FORBIDDEN" }
        };
      } else if (message.startsWith("404")) {
        response = {
          status: 404,
          headers: { "Content-Type": "application/json" },
          body: { error: "Not Found", message }
        };
      } else if (message.startsWith("400") || message.startsWith("409")) {
        const parts = message.split(" ");
        const statusNum = parseInt(parts[0] ?? "400", 10);
        response = {
          status: isNaN(statusNum) ? 400 : statusNum,
          headers: { "Content-Type": "application/json" },
          body: { error: parts[1] || message }
        };
      } else {
        response = {
          status: 500,
          headers: { "Content-Type": "application/json" },
          body: { error: "Internal Server Error", message }
        };
      }
    }

    // Guardar en store de idempotencia si la mutación fue exitosa (2xx)
    if (isMutation && idempotencyKey && response.status >= 200 && response.status < 300) {
      this.idempotencyStore.set(idempotencyKey, response, undefined, nowMs);
    }

    // HU-319: Emisión no bloqueante de admin_action si fue una mutación exitosa y autenticada
    if (isMutation && req.claims && response.status >= 200 && response.status < 300 && req.claims.tid) {
      try {
        this.auditService.appendAuditEntry({
          tenantId: req.claims.tid,
          actorId: req.claims.sub,
          action: `admin_action.${req.method.toLowerCase()}.${req.path.replace(/\//g, "_")}`,
          details: {
            method: req.method,
            path: req.path,
            ip: req.ip,
            requestBody: req.body,
            responseStatus: response.status
          },
          occurredAtMs: nowMs
        });
      } catch {
        // En HU-317, falla de auditoría no interrumpe la respuesta al usuario
      }
    }

    return {
      status: response.status,
      headers: { ...corsHeaders, ...response.headers },
      body: response.body
    };
  }
}
