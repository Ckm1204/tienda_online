import type { JwtClaims } from "@tiendita/service-kit";
import type { TenantService } from "@tiendita/tenant-service";
import type { IdentityService } from "@tiendita/identity-service";
import type { DeviceService } from "@tiendita/device-service";
import type { CatalogService } from "@tiendita/catalog-service";
import type { SalesService } from "@tiendita/sales-service";
import type { CashService } from "@tiendita/cash-service";
import type { InventoryService } from "@tiendita/inventory-service";
import type { CustomerService } from "@tiendita/customer-service";
import type { AuditService } from "@tiendita/audit-service";

export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

export interface HttpRequest {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS";
  path: string;
  ip: string;
  origin?: string;
  headers: Record<string, string | undefined>;
  body?: unknown;
  rawBodySizeBytes?: number;
  claims?: JwtClaims;
}

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

export interface CachedIdempotentResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
  expiresAtMs: number;
}

export interface BffAppDependencies {
  tenantService?: TenantService;
  identityService?: IdentityService;
  deviceService?: DeviceService;
  catalogService?: CatalogService;
  salesService?: SalesService;
  cashService?: CashService;
  inventoryService?: InventoryService;
  customerService?: CustomerService;
  auditService?: AuditService;
}
