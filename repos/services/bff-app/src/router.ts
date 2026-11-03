import { generateOpenApiSpec } from "@tiendita/contracts";
import type { HttpRequest, HttpResponse } from "./types.js";
import type { AuthController } from "./controllers/auth.controller.js";
import type { BootstrapController } from "./controllers/bootstrap.controller.js";
import type { ReportsController } from "./controllers/reports.controller.js";
import type { TerminalsController } from "./controllers/terminals.controller.js";
import type { UsersController } from "./controllers/users.controller.js";
import type { CatalogController } from "./controllers/catalog.controller.js";
import type { InventoryController } from "./controllers/inventory.controller.js";
import type { SalesController } from "./controllers/sales.controller.js";
import type { CustomersController } from "./controllers/customers.controller.js";

export interface RouterControllers {
  authController: AuthController;
  bootstrapController: BootstrapController;
  reportsController: ReportsController;
  terminalsController: TerminalsController;
  usersController: UsersController;
  catalogController: CatalogController;
  inventoryController: InventoryController;
  salesController: SalesController;
  customersController: CustomersController;
}

export class BffRouter {
  constructor(private readonly controllers: RouterControllers) {}

  async route(req: HttpRequest, nowMs: number): Promise<HttpResponse> {
    const { path, method, claims } = req;

    // --- Endpoints públicos ---
    if (method === "GET" && path === "/openapi.json") {
      return {
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: generateOpenApiSpec()
      };
    }

    if (method === "GET" && (path === "/docs" || path === "/api-docs")) {
      const html = `<!doctype html>
<html lang="es">
  <head>
    <title>TienditaOnline API Reference — OpenAPI 3.1</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body>
    <script id="api-reference" data-url="/openapi.json"></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </body>
</html>`;
      return {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
        body: html
      };
    }

    if (method === "POST" && path === "/v1/auth/login") {
      return this.controllers.authController.login(req, nowMs);
    }

    if (method === "POST" && path === "/v1/auth/activate") {
      return this.controllers.authController.activate(req, nowMs);
    }

    // A partir de aquí todos los endpoints requieren autenticación y audiencia "mgmt-app" o "platform"
    if (!claims) {
      return {
        status: 401,
        headers: { "Content-Type": "application/json" },
        body: { error: "UNAUTHORIZED" }
      };
    }

    if (claims.aud !== "mgmt-app" && claims.aud !== "platform") {
      return {
        status: 403,
        headers: { "Content-Type": "application/json" },
        body: { error: "FORBIDDEN_AUDIENCE" }
      };
    }

    const tenantId = claims.tid ?? undefined;
    if (!tenantId && claims.aud !== "platform") {
      return {
        status: 403,
        headers: { "Content-Type": "application/json" },
        body: { error: "NO_TENANT_CONTEXT" }
      };
    }

    // --- Bootstrap ---
    if (method === "GET" && path === "/v1/app/bootstrap") {
      return this.controllers.bootstrapController.bootstrap(req);
    }

    // --- Reportes & Dashboard ---
    if (method === "GET" && path === "/v1/app/reports/dashboard") {
      return this.controllers.reportsController.getDashboard(req, nowMs);
    }
    if (method === "POST" && path === "/v1/app/events/sales-recorded") {
      return this.controllers.reportsController.invalidateSalesCache(req);
    }

    // --- Cajas / Terminales ---
    if (method === "GET" && path === "/v1/app/terminals") {
      return this.controllers.terminalsController.listTerminals(req);
    }
    if (method === "POST" && path === "/v1/app/terminals") {
      return this.controllers.terminalsController.createTerminal(req);
    }
    const matchEnroll = path.match(/^\/v1\/app\/terminals\/([a-zA-Z0-9_-]+)\/enrollment-code$/);
    if (method === "POST" && matchEnroll) {
      return this.controllers.terminalsController.generateEnrollmentCode(matchEnroll[1]!, req, nowMs);
    }
    const matchRevoke = path.match(/^\/v1\/app\/terminals\/([a-zA-Z0-9_-]+)\/revoke$/);
    if (method === "POST" && matchRevoke) {
      return this.controllers.terminalsController.revokeTerminal(matchRevoke[1]!, req, nowMs);
    }
    const matchForceClose = path.match(/^\/v1\/app\/terminals\/([a-zA-Z0-9_-]+)\/force-close-shift$/);
    if (method === "POST" && matchForceClose) {
      return this.controllers.terminalsController.forceCloseShift(matchForceClose[1]!, req);
    }

    // --- Usuarios / Empleados ---
    if (method === "GET" && path === "/v1/app/users") {
      return this.controllers.usersController.listUsers(req);
    }
    if (method === "POST" && path === "/v1/app/users") {
      return this.controllers.usersController.createUser(req, nowMs);
    }
    const matchUserPatch = path.match(/^\/v1\/app\/users\/([a-zA-Z0-9_-]+)$/);
    if (method === "PATCH" && matchUserPatch) {
      return this.controllers.usersController.patchUser(matchUserPatch[1]!, req);
    }

    // --- Catálogo y Productos ---
    const matchBarcode = path.match(/^\/v1\/app\/products\/by-barcode\/([a-zA-Z0-9_-]+)$/);
    if (method === "GET" && matchBarcode) {
      return this.controllers.catalogController.getProductByBarcode(matchBarcode[1]!, req);
    }
    if (method === "GET" && path === "/v1/app/products") {
      return this.controllers.catalogController.listProducts(req);
    }
    if (method === "POST" && path === "/v1/app/products") {
      return this.controllers.catalogController.createProduct(req);
    }
    const matchProductPatch = path.match(/^\/v1\/app\/products\/([a-zA-Z0-9_-]+)$/);
    if (method === "PATCH" && matchProductPatch) {
      return this.controllers.catalogController.patchProduct(matchProductPatch[1]!, req);
    }
    const matchProductDuplicate = path.match(/^\/v1\/app\/products\/([a-zA-Z0-9_-]+)\/duplicate$/);
    if (method === "POST" && matchProductDuplicate) {
      return this.controllers.catalogController.duplicateProduct(matchProductDuplicate[1]!, req);
    }
    if (method === "GET" && path === "/v1/app/products/excel-template") {
      return this.controllers.catalogController.getExcelTemplate();
    }
    if (method === "POST" && path === "/v1/app/catalog/convert-generic") {
      return this.controllers.catalogController.convertGeneric(req);
    }
    if (method === "POST" && path === "/v1/app/catalog/quick-margin-calc") {
      return this.controllers.catalogController.quickMarginCalc(req);
    }
    if (method === "POST" && path === "/v1/app/catalog/bulk-price-update") {
      return this.controllers.catalogController.bulkPriceUpdate(req, nowMs);
    }

    // --- Inventario ---
    if (method === "POST" && path === "/v1/app/inventory/counts") {
      return this.controllers.inventoryController.applyPhysicalCounts(req, nowMs);
    }
    if (method === "POST" && path === "/v1/app/inventory/receptions") {
      return this.controllers.inventoryController.recordPurchaseReceptions(req, nowMs);
    }
    const matchKardex = path.match(/^\/v1\/app\/inventory\/kardex\/([a-zA-Z0-9_-]+)$/);
    if (method === "GET" && matchKardex) {
      return this.controllers.inventoryController.getKardex(matchKardex[1]!, req);
    }

    // --- Ventas y Pagos Digitales ---
    if (method === "POST" && path === "/v1/app/sales/reconcile-digital-payments") {
      return this.controllers.salesController.reconcileDigitalPayments(req);
    }

    // --- Clientes y Cartera ---
    if (method === "GET" && path === "/v1/app/customers") {
      return this.controllers.customersController.listCustomers(req);
    }
    const matchWriteOff = path.match(/^\/v1\/app\/customers\/([a-zA-Z0-9_-]+)\/write-off$/);
    if (method === "POST" && matchWriteOff) {
      return this.controllers.customersController.writeOffDebt(matchWriteOff[1]!, req, nowMs);
    }
    const matchSuppress = path.match(/^\/v1\/app\/customers\/([a-zA-Z0-9_-]+)\/suppress-data$/);
    if (method === "POST" && matchSuppress) {
      return this.controllers.customersController.suppressCustomerData(matchSuppress[1]!, req);
    }

    return {
      status: 404,
      headers: { "Content-Type": "application/json" },
      body: { error: "NOT_FOUND", path }
    };
  }
}
