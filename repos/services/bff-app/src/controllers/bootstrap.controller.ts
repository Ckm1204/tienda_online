import type { IdentityService } from "@tiendita/identity-service";
import type { TenantService } from "@tiendita/tenant-service";
import type { HttpRequest, HttpResponse } from "../types.js";

export class BootstrapController {
  constructor(
    private readonly identityService: IdentityService,
    private readonly tenantService: TenantService
  ) {}

  async bootstrap(req: HttpRequest): Promise<HttpResponse> {
    const claims = req.claims!;
    const tenantId = claims.tid;

    const user = this.identityService.users.get(claims.sub);
    const tenant = tenantId ? this.tenantService.tenants.get(tenantId) : undefined;
    const entitlements = tenantId
      ? this.tenantService.computeEffectiveEntitlements(tenantId)
      : undefined;
    const branches = tenantId
      ? [...this.tenantService.branches.values()].filter((b) => b.tenant_id === tenantId)
      : [];

    return {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      body: {
        user: {
          id: claims.sub,
          full_name: user?.full_name ?? "Usuario",
          email: user?.email ?? null,
          role_code: claims.roles[0],
          permissions: claims.perms
        },
        tenant: tenant
          ? {
              id: tenant.id,
              business_name: tenant.business_name,
              nit: tenant.nit,
              status: tenant.status,
              plan_code: tenant.plan_code
            }
          : null,
        entitlements: entitlements ?? null,
        branches: branches.map((b) => ({
          id: b.id,
          code: b.code,
          name: b.name,
          status: b.status
        }))
      }
    };
  }
}
