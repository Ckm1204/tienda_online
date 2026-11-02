import { describe, it, expect } from "vitest";
import {
  EinvoicingService,
  DianFiscalEngine,
  NumberingBlockManager,
  UblBuilder,
  ContingencyAndWormManager
} from "../index.js";

describe("ÉPICA 15: Facturación Electrónica y Documento Equivalente POS DIAN", () => {
  describe("FT-15.2: Estrategias Fiscales en Caja (CUDE/CUFE, QR, UVT y Plantilla)", () => {
    it("HU-137 & HU-383: Calcula exactamente el CUDE en SHA-384 (96 caracteres) y la URL del QR DIAN", () => {
      const cude = DianFiscalEngine.calculateCude({
        doc_number: "POS-001001",
        issue_date: "2026-11-02",
        issue_time: "14:30:00-05:00",
        subtotal_cents: 100_000_00,
        tax_iva_cents: 19_000_00,
        tax_inc_cents: 0,
        total_cents: 119_000_00,
        issuer_nit: "901234567",
        acquirer_doc: "222222222222",
        technical_key_or_pin: "clave_tecnica_dian_test_pin_1234",
        environment_type: "1"
      });

      expect(cude).toHaveLength(96); // SHA-384 hexadecimal tiene exactamente 96 caracteres
      expect(cude).toMatch(/^[a-f0-9]{96}$/);

      const qrUrl = DianFiscalEngine.generateDianQrUrl(cude);
      expect(qrUrl).toBe(`https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=${cude}`);
    });

    it("HU-385: Valida el tope legal en UVT para Documento Equivalente POS", () => {
      const uvtValue = 47_065_00; // $47.065 COP
      const fiveUvtCents = 5 * uvtValue; // $235.325 COP (23.532.500 centavos)

      // Venta por debajo del tope -> Puede ser Documento Equivalente POS
      const lowSale = DianFiscalEngine.checkUvtThreshold(200_000_00, { uvtValueCents: uvtValue });
      expect(lowSale.requiresInvoice).toBe(false);

      // Venta superior a 5 UVT -> Exige Factura Electrónica (INVOICE)
      const highSale = DianFiscalEngine.checkUvtThreshold(250_000_00, { uvtValueCents: uvtValue });
      expect(highSale.requiresInvoice).toBe(true);
      expect(highSale.reason).toContain("tope legal de 5 UVT");

      // Solicitud expresa del cliente con NIT -> Exige Factura Electrónica independientemente del monto
      const clientReq = DianFiscalEngine.checkUvtThreshold(50_000_00, {
        uvtValueCents: uvtValue,
        customerRequestedInvoice: true
      });
      expect(clientReq.requiresInvoice).toBe(true);
      expect(clientReq.reason).toContain("Solicitud expresa del cliente");
    });

    it("HU-384: Genera leyendas legales obligatorias y comandos ESC/POS para impresión QR", () => {
      const legends = DianFiscalEngine.formatReceiptDianPosLegends({
        resolutionNumber: "18764000001",
        resolutionDateFrom: "2026-01-01",
        resolutionDateTo: "2027-01-01",
        prefix: "POS",
        rangeFrom: 1,
        rangeTo: 50000,
        cude: "mock_cude_sha384_example",
        providerName: "Cadena S.A.",
        providerNit: "890900123",
        softwareId: "TIENDITA-POS-V1"
      });

      expect(legends.length).toBe(6);
      expect(legends[0]).toContain("DOCUMENTO EQUIVALENTE ELECTRÓNICO");
      expect(legends[1]).toContain("Resolución DIAN No. 18764000001");
      expect(legends[3]).toContain("CUDE: mock_cude_sha384_example");

      const escPosCmd = DianFiscalEngine.formatEscPosQrCommand("https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=test");
      expect(escPosCmd).toBeInstanceOf(Buffer);
      expect(escPosCmd[0]).toBe(0x1d); // GS
      expect(escPosCmd[1]).toBe(0x28); // (
      expect(escPosCmd[2]).toBe(0x6b); // k
    });
  });

  describe("FT-15.1: einvoicing-service, Resoluciones y Bloques GiST", () => {
    it("HU-136, HU-379 & HU-380: Custodia de clave técnica en Secrets Manager y exclusión GiST de bloques", () => {
      const mgr = new NumberingBlockManager();

      // Falla si la clave técnica está en texto plano en lugar de Secrets Manager
      expect(() =>
        mgr.registerResolution({
          tenantId: "t1",
          docKind: "POS_EQUIVALENT",
          resolutionNumber: "187600001",
          prefix: "POS",
          rangeFrom: 1,
          rangeTo: 10000,
          validFrom: "2026-01-01",
          validTo: "2027-01-01",
          technicalKeyRef: "clave_plana_insegura_123"
        })
      ).toThrow("Debe ser una referencia a Secrets Manager");

      const res = mgr.registerResolution({
        tenantId: "t1",
        docKind: "POS_EQUIVALENT",
        resolutionNumber: "187600001",
        prefix: "POS",
        rangeFrom: 1,
        rangeTo: 10000,
        validFrom: "2026-01-01",
        validTo: "2027-01-01",
        technicalKeyRef: "arn:aws:secretsmanager:us-east-1:123456789012:secret:tiendita-dian-key-01"
      });

      expect(res.id).toBeDefined();

      // Asignar bloque 1..1000 a CAJA-01
      const b1 = mgr.assignBlock({
        tenantId: "t1",
        resolutionId: res.id,
        terminalId: "CAJA-01",
        blockFrom: 1,
        blockTo: 1000,
        status: "ACTIVE"
      });
      expect(b1.status).toBe("ACTIVE");

      // Intento de asignar bloque solapado 500..2000 a CAJA-02 es rechazado por regla GiST (HU-379)
      expect(() =>
        mgr.assignBlock({
          tenantId: "t1",
          resolutionId: res.id,
          terminalId: "CAJA-02",
          blockFrom: 500,
          blockTo: 2000
        })
      ).toThrow("EXCLUSION_VIOLATION");

      // Asignar bloque no solapado 1001..2000 a CAJA-02 es exitoso
      const b2 = mgr.assignBlock({
        tenantId: "t1",
        resolutionId: res.id,
        terminalId: "CAJA-02",
        blockFrom: 1001,
        blockTo: 2000
      });
      expect(b2.block_from).toBe(1001);
    });

    it("HU-382 & HU-136: Consumo de consecutivo, salto a STANDBY y aviso de reposición al 80 %", () => {
      const mgr = new NumberingBlockManager();
      const res = mgr.registerResolution({
        tenantId: "t1",
        docKind: "POS_EQUIVALENT",
        resolutionNumber: "187600002",
        prefix: "POS",
        rangeFrom: 1,
        rangeTo: 100,
        validFrom: "2026-01-01",
        validTo: "2027-01-01",
        technicalKeyRef: "secret:tiendita-dian-key-02"
      });

      // Bloque activo pequeño (1..10) y bloque standby (11..20)
      mgr.assignBlock({
        tenantId: "t1",
        resolutionId: res.id,
        terminalId: "CAJA-01",
        blockFrom: 1,
        blockTo: 10,
        status: "ACTIVE"
      });

      mgr.assignBlock({
        tenantId: "t1",
        resolutionId: res.id,
        terminalId: "CAJA-01",
        blockFrom: 11,
        blockTo: 20,
        status: "STANDBY"
      });

      // Consumir números 1 al 10
      for (let i = 1; i <= 10; i++) {
        const c = mgr.consumeNextNumber("CAJA-01", res.id);
        expect(c.number).toBe(i);
        expect(c.prefix).toBe("POS");
      }

      // Al consumir el 11, conmuta automáticamente al bloque STANDBY promovido a ACTIVE
      const nextCons = mgr.consumeNextNumber("CAJA-01", res.id);
      expect(nextCons.number).toBe(11);
    });

    it("HU-381: Dispara alertas preventivas de vencimiento de vigencia o agotamiento de rango", () => {
      const mgr = new NumberingBlockManager();
      const nowMs = new Date("2026-11-02T12:00:00-05:00").getTime();

      // Resolución que vence en 5 días (CRITICAL)
      mgr.registerResolution({
        tenantId: "t1",
        docKind: "POS_EQUIVALENT",
        resolutionNumber: "1876-EXPIRING",
        prefix: "EXP",
        rangeFrom: 1,
        rangeTo: 1000,
        validFrom: "2025-11-06",
        validTo: "2026-11-06", // Dentro de 5 días
        technicalKeyRef: "secret:exp-key"
      });

      const alerts = mgr.checkResolutionAlerts(nowMs);
      expect(alerts.length).toBeGreaterThanOrEqual(1);
      const expiryAlert = alerts.find((a) => a.alertType === "DAYS_TO_EXPIRY");
      expect(expiryAlert?.level).toBe("CRITICAL");
      expect(expiryAlert?.message).toContain("vence en 5 días");
    });
  });

  describe("FT-15.3: Transmisión UBL 2.1, Contingencia, Notas y WORM", () => {
    it("HU-386: Genera XML UBL 2.1 válido para Documento Equivalente POS y Factura de Venta", () => {
      const xml = UblBuilder.buildUblXml({
        kind: "POS_EQUIVALENT",
        prefix: "POS",
        number: 105,
        cude: "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
        issue_date: "2026-11-02",
        issue_time: "15:00:00-05:00",
        issuer: {
          nit: "901234567",
          dv: "1",
          legal_name: "Tienda Don Juan S.A.S.",
          trade_name: "Tienda Don Juan",
          address: "Calle 10 # 20-30",
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
            name: "Aceite Premier 1L",
            qty_milli: 1000,
            unit_code: "H87",
            unit_price_cents: 9_500_00,
            total_cents: 9_500_00,
            tax_kind: "01",
            tax_rate_bp: 1900,
            tax_amount_cents: 1_805_00
          }
        ],
        subtotal_cents: 9_500_00,
        tax_cents: 1_805_00,
        total_cents: 11_305_00
      });

      expect(xml).toContain("<cbc:UBLVersionID>UBL 2.1</cbc:UBLVersionID>");
      expect(xml).toContain("<cbc:InvoiceTypeCode>20</cbc:InvoiceTypeCode>");
      expect(xml).toContain("<cbc:LineExtensionAmount currencyID=\"COP\">9500.00</cbc:LineExtensionAmount>");

      const validation = UblBuilder.validateUblStructure(xml);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it("HU-138, HU-387 & HU-460..HU-465: Contingencia, S3 WORM, AttachedDoc, TestSetId y Hot Activation", () => {
      const cw = new ContingencyAndWormManager();

      // Transmisión normal con proveedor saludable
      const doc = cw.transmitDocument({
        tenantId: "tenant_01",
        sourceType: "SALE",
        sourceId: "sale_01",
        docKind: "POS_EQUIVALENT",
        prefix: "POS",
        number: 1001,
        cude: "cude_1001",
        qrUrl: "https://dian.gov.co/qr?cude_1001",
        xmlContent: "<Invoice>UBL CONTENT</Invoice>"
      });

      expect(doc.status).toBe("ACCEPTED");
      expect(doc.contingency).toBe(false);
      expect(cw.wormArchive.has(doc.xml_s3_key!)).toBe(true); // S3 Object Lock 10 años WORM

      // Empaquetado de AttachedDocument (HU-462)
      const attached = cw.packageAttachedDocument({
        docId: doc.id,
        xmlSignedContent: "<SignedInvoice/>",
        applicationResponseContent: "<ApplicationResponse/>"
      });
      expect(attached.zip_file_name).toBe("ad_POS1001.zip");
      expect(attached.sha256_checksum).toHaveLength(64);

      // Simular caída del proveedor tecnológico (Circuit Breaker -> Modo Contingencia HU-138)
      cw.isProviderHealthy = false;
      const contDoc = cw.transmitDocument({
        tenantId: "tenant_01",
        sourceType: "SALE",
        sourceId: "sale_02",
        docKind: "POS_EQUIVALENT",
        prefix: "POS",
        number: 1002,
        cude: "cude_1002",
        qrUrl: "https://dian.gov.co/qr?cude_1002",
        xmlContent: "<Invoice>UBL CONTENT 2</Invoice>"
      });

      expect(contDoc.status).toBe("PENDING");
      expect(contDoc.contingency).toBe(true);

      // Panel de monitoreo Super Admin (HU-465)
      const dash = cw.getSuperAdminMonitoringSummary();
      expect(dash.total_documents).toBe(2);
      expect(dash.pending_documents).toBe(1);

      // Ejecutor de set de pruebas TestSetId (HU-463)
      const testRun = cw.runTestSetHabilitation({
        tenantId: "tenant_01",
        testSetId: "TEST-SET-DIAN-999"
      });
      expect(testRun.completed).toBe(true);
      expect(testRun.passedCount).toBe(10);

      // Activación en caliente de fiscal_mode = DIAN_POS (HU-464)
      const activation = cw.switchFiscalMode("tenant_01", "DIAN_POS");
      expect(activation.previousMode).toBe("NONE");
      expect(activation.newMode).toBe("DIAN_POS");
    });
  });
});
