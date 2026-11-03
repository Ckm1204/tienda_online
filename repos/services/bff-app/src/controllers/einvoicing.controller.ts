import type { EinvoicingService } from "@tiendita/einvoicing-service";
import type { HttpRequest, HttpResponse } from "../types.js";

/**
 * HU-136, HU-379..HU-387: Controlador BFF para Facturación Electrónica y Documento Equivalente POS DIAN
 */
export class EinvoicingController {
  constructor(private readonly einvoicingService?: EinvoicingService) {}

  async listResolutions(req: HttpRequest): Promise<HttpResponse> {
    const claims = req.claims!;
    const safeTenantId = claims.tid!;

    if (!this.einvoicingService) {
      return {
        status: 501,
        headers: { "Content-Type": "application/json" },
        body: { error: "EINVOICING_SERVICE_UNAVAILABLE" }
      };
    }

    const resolutions = [...this.einvoicingService.numbering.resolutions.values()].filter(
      (r) => r.tenant_id === safeTenantId
    );

    const blocks = [...this.einvoicingService.numbering.blocks.values()].filter(
      (b) => b.tenant_id === safeTenantId
    );

    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: { resolutions, blocks }
    };
  }

  async registerResolution(req: HttpRequest, nowMs: number): Promise<HttpResponse> {
    const claims = req.claims!;
    const safeTenantId = claims.tid!;
    const body = req.body as any;

    if (!this.einvoicingService) {
      return {
        status: 501,
        headers: { "Content-Type": "application/json" },
        body: { error: "EINVOICING_SERVICE_UNAVAILABLE" }
      };
    }

    try {
      const resolution = this.einvoicingService.numbering.registerResolution({
        tenantId: safeTenantId,
        docKind: body.docKind ?? "POS_EQUIVALENT",
        resolutionNumber: body.resolutionNumber,
        prefix: body.prefix,
        rangeFrom: body.rangeFrom,
        rangeTo: body.rangeTo,
        validFrom: body.validFrom,
        validTo: body.validTo,
        technicalKeyRef: body.technicalKeyRef,
        nowMs
      });

      return {
        status: 201,
        headers: { "Content-Type": "application/json" },
        body: resolution
      };
    } catch (err: any) {
      return {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: { error: err.message ?? "FAILED_TO_REGISTER_RESOLUTION" }
      };
    }
  }

  async getAlerts(req: HttpRequest, nowMs: number): Promise<HttpResponse> {
    const claims = req.claims!;
    const safeTenantId = claims.tid!;

    if (!this.einvoicingService) {
      return {
        status: 501,
        headers: { "Content-Type": "application/json" },
        body: { error: "EINVOICING_SERVICE_UNAVAILABLE" }
      };
    }

    const allAlerts = this.einvoicingService.numbering.checkResolutionAlerts(nowMs);
    const tenantResIds = new Set(
      [...this.einvoicingService.numbering.resolutions.values()]
        .filter((r) => r.tenant_id === safeTenantId)
        .map((r) => r.id)
    );

    const filteredAlerts = allAlerts.filter((a) => tenantResIds.has(a.resolutionId));

    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: {
        alerts: filteredAlerts,
        checked_at_ms: nowMs
      }
    };
  }

  async getContingencyStatus(req: HttpRequest): Promise<HttpResponse> {
    if (!this.einvoicingService) {
      return {
        status: 501,
        headers: { "Content-Type": "application/json" },
        body: { error: "EINVOICING_SERVICE_UNAVAILABLE" }
      };
    }

    const summary = this.einvoicingService.contingencyWorm.getSuperAdminMonitoringSummary();
    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: summary
    };
  }
}
