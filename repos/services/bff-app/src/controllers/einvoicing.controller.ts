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

  /**
   * HU-137, HU-383: Cálculo en línea de hash CUDE en SHA-384 y generación de URL QR oficial DIAN.
   */
  async calculateCude(req: HttpRequest): Promise<HttpResponse> {
    if (!this.einvoicingService) {
      return {
        status: 501,
        headers: { "Content-Type": "application/json" },
        body: { error: "EINVOICING_SERVICE_UNAVAILABLE" }
      };
    }

    const body = req.body as any;
    if (!body || !body.doc_number || !body.issuer_nit) {
      return {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: { error: "MISSING_REQUIRED_FIELDS" }
      };
    }

    try {
      const cude = this.einvoicingService.fiscalEngine.calculateCude({
        doc_number: String(body.doc_number),
        issue_date: String(body.issue_date ?? new Date().toISOString().slice(0, 10)),
        issue_time: String(body.issue_time ?? "12:00:00-05:00"),
        subtotal_cents: Number(body.subtotal_cents ?? 0),
        tax_iva_cents: Number(body.tax_iva_cents ?? 0),
        tax_inc_cents: Number(body.tax_inc_cents ?? 0),
        total_cents: Number(body.total_cents ?? 0),
        issuer_nit: String(body.issuer_nit),
        acquirer_doc: String(body.acquirer_doc ?? "222222222222"),
        technical_key_or_pin: String(body.technical_key_or_pin ?? "test_technical_key"),
        environment_type: body.environment_type === "2" ? "2" : "1"
      });

      const qrUrl = this.einvoicingService.fiscalEngine.generateDianQrUrl(cude);

      return {
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: { cude, qr_url: qrUrl }
      };
    } catch (err: any) {
      return {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: { error: err.message ?? "CUDE_CALCULATION_FAILED" }
      };
    }
  }

  /**
   * HU-138, HU-386: Generación y previsualización de documento UBL 2.1 oficial DIAN (XML).
   */
  async generateUblXml(req: HttpRequest): Promise<HttpResponse> {
    if (!this.einvoicingService) {
      return {
        status: 501,
        headers: { "Content-Type": "application/json" },
        body: { error: "EINVOICING_SERVICE_UNAVAILABLE" }
      };
    }

    const body = req.body as any;
    try {
      const xml = this.einvoicingService.ubl.buildUblXml(body);
      return {
        status: 200,
        headers: { "Content-Type": "application/xml; charset=utf-8" },
        body: xml
      };
    } catch (err: any) {
      return {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: { error: err.message ?? "UBL_GENERATION_FAILED" }
      };
    }
  }

  /**
   * HU-463: Asistente y ejecutor del Set de Pruebas de Habilitación DIAN (TestSetId).
   */
  async runTestSet(req: HttpRequest): Promise<HttpResponse> {
    if (!this.einvoicingService) {
      return {
        status: 501,
        headers: { "Content-Type": "application/json" },
        body: { error: "EINVOICING_SERVICE_UNAVAILABLE" }
      };
    }

    const claims = req.claims!;
    const safeTenantId = claims.tid!;
    const body = req.body as any;

    if (!body || !body.testSetId) {
      return {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: { error: "MISSING_TEST_SET_ID" }
      };
    }

    try {
      const result = this.einvoicingService.contingencyWorm.runTestSetHabilitation({
        tenantId: safeTenantId,
        testSetId: String(body.testSetId),
        totalRequired: body.totalRequired ? Number(body.totalRequired) : 10
      });

      return {
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: result
      };
    } catch (err: any) {
      return {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: { error: err.message ?? "TEST_SET_EXECUTION_FAILED" }
      };
    }
  }

  /**
   * HU-464: Activación en caliente de fiscal_mode = DIAN_POS sin alterar comprobantes anteriores.
   */
  async switchFiscalMode(req: HttpRequest): Promise<HttpResponse> {
    if (!this.einvoicingService) {
      return {
        status: 501,
        headers: { "Content-Type": "application/json" },
        body: { error: "EINVOICING_SERVICE_UNAVAILABLE" }
      };
    }

    const claims = req.claims!;
    const safeTenantId = claims.tid!;
    const body = req.body as any;

    if (!body || !body.fiscalMode || (body.fiscalMode !== "NONE" && body.fiscalMode !== "DIAN_POS")) {
      return {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: { error: "INVALID_FISCAL_MODE" }
      };
    }

    try {
      const result = this.einvoicingService.contingencyWorm.switchFiscalMode(safeTenantId, body.fiscalMode);
      return {
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: result
      };
    } catch (err: any) {
      return {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: { error: err.message ?? "FISCAL_MODE_SWITCH_FAILED" }
      };
    }
  }
}
