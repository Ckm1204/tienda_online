import type { CustomerService } from "@tiendita/customer-service";
import type { HttpRequest, HttpResponse } from "../types.js";
import { requirePermission, requireStepUpMfa } from "../middlewares/gateway-security.js";

export class CustomersController {
  constructor(private readonly customerService: CustomerService) {}

  async listCustomers(req: HttpRequest): Promise<HttpResponse> {
    const claims = req.claims!;
    requirePermission(claims, "customer.read");
    const customers = [...this.customerService.customers.values()].filter(
      (c) => c.tenant_id === claims.tid
    );
    return { status: 200, headers: { "Content-Type": "application/json" }, body: customers };
  }

  async writeOffDebt(
    customerId: string,
    req: HttpRequest,
    nowMs: number
  ): Promise<HttpResponse> {
    const claims = req.claims!;
    requirePermission(claims, "customer.credit_manage");
    requireStepUpMfa(claims, 300, nowMs);
    const { reason } = (req.body as any) || {};
    const res = this.customerService.writeOffCustomerDebt({
      tenantId: claims.tid!,
      customerId,
      reason: reason || "Castigo desde App de Gestión",
      mfaVerified: true,
      nowMs
    });
    return { status: 200, headers: { "Content-Type": "application/json" }, body: res };
  }

  async suppressCustomerData(customerId: string, req: HttpRequest): Promise<HttpResponse> {
    const claims = req.claims!;
    requirePermission(claims, "customer.manage");
    const res = this.customerService.suppressCustomerPersonalData(claims.tid!, customerId);
    return { status: 200, headers: { "Content-Type": "application/json" }, body: res };
  }
}
