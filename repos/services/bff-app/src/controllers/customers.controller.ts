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

  /**
   * HU-446: Valida si un contacto de cobranza o recordatorio está autorizado bajo Ley 2300 de 2023 ("Dejen de Fregar").
   */
  async checkContactAllowed(
    customerId: string,
    req: HttpRequest,
    nowMs: number
  ): Promise<HttpResponse> {
    const claims = req.claims!;
    requirePermission(claims, "customer.read");
    const body = (req.body as any) || {};
    const res = this.customerService.validateCollectionContactAllowed({
      tenantId: claims.tid!,
      customerId,
      targetIsDebtorOrCodebtor: body.targetIsDebtorOrCodebtor ?? true,
      channel: body.channel || "SMS",
      nowMs: body.nowMs || nowMs
    });
    return { status: 200, headers: { "Content-Type": "application/json" }, body: res };
  }

  /**
   * HU-446: Registra un intento de contacto de cobranza y genera trazabilidad ante la SIC.
   */
  async recordContact(
    customerId: string,
    req: HttpRequest,
    nowMs: number
  ): Promise<HttpResponse> {
    const claims = req.claims!;
    requirePermission(claims, "customer.credit_manage");
    const body = (req.body as any) || {};
    const res = this.customerService.recordCollectionContact({
      tenantId: claims.tid!,
      customerId,
      targetIsDebtorOrCodebtor: body.targetIsDebtorOrCodebtor ?? true,
      channel: body.channel || "SMS",
      agentOrSystemId: claims.sub || "system",
      notes: body.notes,
      nowMs: body.nowMs || nowMs
    });
    return { status: 201, headers: { "Content-Type": "application/json" }, body: res };
  }

  /**
   * HU-446: Obtiene el log de auditoría de contactos de cobranza del cliente para inspección regulatoria (SIC).
   */
  async getContactAudit(customerId: string, req: HttpRequest): Promise<HttpResponse> {
    const claims = req.claims!;
    requirePermission(claims, "customer.read");
    const res = this.customerService.getCustomerContactAuditLog(claims.tid!, customerId);
    return { status: 200, headers: { "Content-Type": "application/json" }, body: res };
  }
}
