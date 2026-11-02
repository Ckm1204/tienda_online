import { isWeakPin } from "@tiendita/contracts";
import type { IdentityService } from "@tiendita/identity-service";
import type { HttpRequest, HttpResponse } from "../types.js";
import { requirePermission } from "../middlewares/gateway-security.js";

export class UsersController {
  constructor(private readonly identityService: IdentityService) {}

  async listUsers(req: HttpRequest): Promise<HttpResponse> {
    const claims = req.claims!;
    requirePermission(claims, "user.read");
    const users = [...this.identityService.users.values()]
      .filter((u) => u.tenant_id === claims.tid)
      .map((u) => ({
        id: u.id,
        full_name: u.full_name,
        email: u.email,
        phone: u.phone,
        role_code: u.role_code,
        branch_id: u.branch_id,
        status: u.status
      }));
    return { status: 200, headers: { "Content-Type": "application/json" }, body: users };
  }

  async createUser(req: HttpRequest, nowMs: number): Promise<HttpResponse> {
    const claims = req.claims!;
    requirePermission(claims, "user.manage");
    const { fullName, email, roleCode, branchId, initialPin } = (req.body as any) || {};
    if (initialPin && isWeakPin(initialPin)) {
      return { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "WEAK_PIN" } };
    }
    const newUser = this.identityService.createStoreUser({
      tenantId: claims.tid!,
      fullName,
      email,
      roleCode,
      branchId: branchId ?? null,
      pin: initialPin,
      nowMs
    });
    return { status: 201, headers: { "Content-Type": "application/json" }, body: newUser };
  }

  async patchUser(userId: string, req: HttpRequest): Promise<HttpResponse> {
    const claims = req.claims!;
    requirePermission(claims, "user.manage");
    const user = this.identityService.users.get(userId);
    if (!user || user.tenant_id !== claims.tid) {
      return { status: 404, headers: { "Content-Type": "application/json" }, body: { error: "USER_NOT_FOUND" } };
    }
    const { status, roleCode, branchId, resetPin } = (req.body as any) || {};
    if (status) user.status = status;
    if (roleCode) user.role_code = roleCode;
    if (branchId !== undefined) user.branch_id = branchId;
    if (resetPin) {
      if (isWeakPin(resetPin)) {
        return { status: 400, headers: { "Content-Type": "application/json" }, body: { error: "WEAK_PIN" } };
      }
      this.identityService.resetUserPin(userId, resetPin);
    }
    return { status: 200, headers: { "Content-Type": "application/json" }, body: { updated: true, user } };
  }
}
