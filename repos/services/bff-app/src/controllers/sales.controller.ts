import type { SalesService } from "@tiendita/sales-service";
import type { HttpRequest, HttpResponse } from "../types.js";
import { requirePermission } from "../middlewares/gateway-security.js";

export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  async reconcileDigitalPayments(req: HttpRequest): Promise<HttpResponse> {
    const claims = req.claims!;
    requirePermission(claims, "reports.read");
    const { paymentIds, status } = (req.body as any) || {};
    const reconciled = this.salesService.reconcilePaymentsBatch({
      tenantId: claims.tid!,
      paymentIds: paymentIds || [],
      status: status || "CONFIRMED",
      actorId: claims.sub
    });
    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: { reconciledCount: reconciled.length, items: reconciled }
    };
  }
}
