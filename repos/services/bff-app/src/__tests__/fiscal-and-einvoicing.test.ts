import { describe, it, expect, beforeEach } from "vitest";
import { BffApp, type HttpRequest } from "../index.js";

describe("BFF: Integración Fiscal Colombiana (Art. 616 E.T. & Facturación DIAN)", () => {
  let bff: BffApp;
  const tenantId = "tenant-dian-01";
  const nowMs = new Date("2026-11-02T15:30:00-05:00").getTime();
  const authHeaders = {
    "content-type": "application/json"
  };
  const claims = {
    sub: "user-owner-01",
    tid: tenantId,
    aud: "mgmt-app",
    role: "OWNER"
  };

  beforeEach(() => {
    bff = new BffApp();
  });

  it("Consolida ventas automáticamente y expone el Libro Fiscal de Operaciones Diarias", async () => {
    // 1. Registrar venta con desglose tributario exacto
    const saleResult = bff.recordSaleAndConsolidate({
      eventId: "evt-sale-001",
      tenantId,
      branchId: "branch-01",
      terminalId: "CAJA-01",
      cashSessionId: "session-01",
      cashierId: "cashier-01",
      saleId: "sale-001",
      receiptPrefix: "POS",
      receiptNumber: 1,
      totalCents: 119_000_00,
      taxBreakdown: {
        gravado19_cents: 100_000_00,
        iva19_cents: 19_000_00,
        gravado5_cents: 0,
        iva5_cents: 0,
        exento_cents: 0,
        excluido_cents: 0,
        inc8_cents: 0
      },
      lines: [
        {
          line_id: "line-1",
          product_id: "prod-1",
          description: "Arroz Extra 5kg",
          qty_milli: 1000,
          unit_price_cents: 119_000_00,
          line_total_cents: 119_000_00
        }
      ],
      payments: [
        {
          payment_id: "pay-1",
          method: "CASH",
          amount_cents: 119_000_00,
          reference: null
        }
      ],
      occurredAtMs: nowMs
    });

    expect(saleResult.sale?.receipt_code).toBe("POS-000001");

    // 2. Consultar Libro Fiscal mensual a través del endpoint GET /v1/app/reports/libro-fiscal
    const req: HttpRequest = {
      method: "GET",
      path: "/v1/app/reports/libro-fiscal?yearMonth=2026-11",
      ip: "127.0.0.1",
      headers: authHeaders,
      claims
    };

    const res = await bff.handleRequest(req, nowMs);
    expect(res.status).toBe(200);

    const body = res.body as any;
    expect(body.yearMonth).toBe("2026-11");
    expect(body.totalesMes.totalIngresosBrutosCents).toBe(119_000_00);
    expect(body.totalesMes.totalIngresosNetosCents).toBe(119_000_00);
    expect(body.uvtConfig.alertaUvt).toBe("NORMAL");
    expect(body.dias.length).toBeGreaterThanOrEqual(1);
  });

  it("Exporta el Libro Fiscal en CSV tabular oficial (Art. 616 E.T.)", async () => {
    // Registrar una venta previa
    bff.recordSaleAndConsolidate({
      eventId: "evt-sale-csv",
      tenantId,
      branchId: "branch-01",
      terminalId: "CAJA-01",
      cashSessionId: "session-01",
      cashierId: "cashier-01",
      saleId: "sale-csv",
      receiptPrefix: "POS",
      receiptNumber: 2,
      totalCents: 50_000_00,
      lines: [],
      payments: [{ payment_id: "p2", method: "CASH", amount_cents: 50_000_00, reference: null }],
      occurredAtMs: nowMs
    });

    const req: HttpRequest = {
      method: "GET",
      path: "/v1/app/reports/libro-fiscal/csv?yearMonth=2026-11",
      ip: "127.0.0.1",
      headers: authHeaders,
      claims
    };

    const res = await bff.handleRequest(req, nowMs);
    expect(res.status).toBe(200);
    expect(res.headers["Content-Type"]).toContain("text/csv");
    expect(res.headers["Content-Disposition"]).toContain("LibroFiscal_Art616_");
    expect(res.headers["Content-Disposition"]).toContain("2026-11.csv");
    expect(typeof res.body).toBe("string");
    expect(res.body as string).toContain("Fecha,Consecutivo Inicial,Consecutivo Final");
    expect(res.body as string).toContain("TOTALES MES");
  });

  it("Exporta el cierre fiscal en formato tiquete térmico 80 mm para impresión ESC/POS", async () => {
    const req: HttpRequest = {
      method: "GET",
      path: "/v1/app/reports/libro-fiscal/thermal?yearMonth=2026-11",
      ip: "127.0.0.1",
      headers: authHeaders,
      claims
    };

    const res = await bff.handleRequest(req, nowMs);
    expect(res.status).toBe(200);
    expect(res.headers["Content-Type"]).toContain("text/plain");
    expect(typeof res.body).toBe("string");
    expect(res.body as string).toContain("LIBRO FISCAL DE OPERACIONES DIARIAS");
    expect(res.body as string).toContain("Art. 616 del E.T.");
    expect(res.body as string).toContain("Tope 3.500 UVT");
  });

  it("Gestiona resoluciones DIAN y vigila alertas de vencimiento y agotamiento de rango", async () => {
    // 1. Registro de resolución válido (referencia a AWS Secrets Manager)
    const registerReq: HttpRequest = {
      method: "POST",
      path: "/v1/app/einvoicing/resolutions",
      ip: "127.0.0.1",
      headers: authHeaders,
      claims,
      body: {
        docKind: "POS_EQUIVALENT",
        resolutionNumber: "18760000005",
        prefix: "POS",
        rangeFrom: 1,
        rangeTo: 10000,
        validFrom: "2026-01-01",
        validTo: "2026-11-06", // Vence en 5 días (CRITICAL)
        technicalKeyRef: "arn:aws:secretsmanager:us-east-1:123456789012:secret:tiendita-prod-dian-key"
      }
    };

    const regRes = await bff.handleRequest(registerReq, nowMs);
    expect(regRes.status).toBe(201);
    expect((regRes.body as any).resolution_number).toBe("18760000005");

    // 2. Intento de registro con clave en texto plano es rechazado con 400
    const invalidReq: HttpRequest = {
      method: "POST",
      path: "/v1/app/einvoicing/resolutions",
      ip: "127.0.0.1",
      headers: authHeaders,
      claims,
      body: {
        docKind: "POS_EQUIVALENT",
        resolutionNumber: "18760000006",
        prefix: "POS",
        rangeFrom: 10001,
        rangeTo: 20000,
        validFrom: "2026-01-01",
        validTo: "2027-01-01",
        technicalKeyRef: "clave_plana_insegura_1234"
      }
    };

    const invRes = await bff.handleRequest(invalidReq, nowMs);
    expect(invRes.status).toBe(400);

    // 3. Consultar alertas activas
    const alertReq: HttpRequest = {
      method: "GET",
      path: "/v1/app/einvoicing/alerts",
      ip: "127.0.0.1",
      headers: authHeaders,
      claims
    };

    const alertRes = await bff.handleRequest(alertReq, nowMs);
    expect(alertRes.status).toBe(200);
    const alerts = (alertRes.body as any).alerts;
    expect(alerts.length).toBeGreaterThanOrEqual(1);
    expect(alerts[0].level).toBe("CRITICAL");
    expect(alerts[0].message).toContain("vence en 5 días");

    // 4. Consultar estado de contingencia y archivo WORM
    const contReq: HttpRequest = {
      method: "GET",
      path: "/v1/app/einvoicing/contingency",
      ip: "127.0.0.1",
      headers: authHeaders,
      claims
    };

    const contRes = await bff.handleRequest(contReq, nowMs);
    expect(contRes.status).toBe(200);
    expect((contRes.body as any).total_documents).toBeDefined();

    // 5. Calcular CUDE y URL del código QR DIAN vía BFF
    const cudeReq: HttpRequest = {
      method: "POST",
      path: "/v1/app/einvoicing/cude",
      ip: "127.0.0.1",
      headers: authHeaders,
      claims,
      body: {
        doc_number: "POS-001001",
        issue_date: "2026-11-02",
        issue_time: "14:30:00-05:00",
        subtotal_cents: 100_000_00,
        tax_iva_cents: 19_000_00,
        tax_inc_cents: 0,
        total_cents: 119_000_00,
        issuer_nit: "901234567",
        acquirer_doc: "222222222222",
        technical_key_or_pin: "test_technical_key",
        environment_type: "1"
      }
    };

    const cudeRes = await bff.handleRequest(cudeReq, nowMs);
    expect(cudeRes.status).toBe(200);
    const cudeBody = cudeRes.body as any;
    expect(cudeBody.cude).toHaveLength(96);
    expect(cudeBody.qr_url).toContain("catalogo-vpfe.dian.gov.co");

    // 6. Generar documento XML UBL 2.1 oficial vía BFF
    const ublReq: HttpRequest = {
      method: "POST",
      path: "/v1/app/einvoicing/ubl-preview",
      ip: "127.0.0.1",
      headers: authHeaders,
      claims,
      body: {
        kind: "POS_EQUIVALENT",
        prefix: "POS",
        number: 1001,
        cude: cudeBody.cude,
        issue_date: "2026-11-02",
        issue_time: "14:30:00-05:00",
        issuer: {
          nit: "901234567",
          dv: "1",
          legal_name: "Tienda La Esmeralda SAS",
          trade_name: "La Esmeralda",
          address: "Cra 15 # 45-20",
          city_code: "11001"
        },
        acquirer: {
          doc_type: "222222222222",
          doc_number: "222222222222",
          name: "Consumidor Final"
        },
        payment_mean: "10",
        lines: [
          {
            id: "1",
            name: "Arroz Diana 1kg",
            qty_milli: 1000,
            unit_code: "H87",
            unit_price_cents: 100_000_00,
            total_cents: 119_000_00,
            tax_kind: "01",
            tax_rate_bp: 1900,
            tax_amount_cents: 19_000_00
          }
        ],
        subtotal_cents: 100_000_00,
        tax_cents: 19_000_00,
        total_cents: 119_000_00
      }
    };

    const ublRes = await bff.handleRequest(ublReq, nowMs);
    expect(ublRes.status).toBe(200);
    expect(ublRes.headers?.["Content-Type"]).toContain("application/xml");
    expect(ublRes.body).toContain("<Invoice");
    expect(ublRes.body).toContain("urn:oasis:names:specification:ubl:schema:xsd:Invoice-2");
  });
});
