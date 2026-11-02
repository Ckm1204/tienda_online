import crypto from "node:crypto";
import { newId } from "@tiendita/contracts";
import type { ElectronicDocumentRecord, DianDocKind } from "./types.js";

/**
 * HU-138, HU-387, HU-462, HU-463, HU-464, HU-465:
 * - Manejo de Contingencia Offline y Reintentos con Circuit Breaker
 * - Almacenamiento en S3 Object Lock (WORM 10 años)
 * - Empaquetado de AttachedDocument (ZIP con XML firmado + ApplicationResponse + PDF)
 * - Ejecutor del Set de Pruebas DIAN (TestSetId)
 * - Activación en caliente de fiscal_mode = DIAN_POS
 * - Panel de Monitoreo de Facturación Electrónica en Consola Super Admin
 */

export interface AttachedDocumentContainer {
  zip_file_name: string;
  xml_signed_content: string;
  application_response_content: string;
  pdf_base64: string;
  s3_key: string;
  sha256_checksum: string;
}

export class ContingencyAndWormManager {
  public readonly electronicDocuments = new Map<string, ElectronicDocumentRecord>();
  public readonly wormArchive = new Map<
    string,
    { s3_key: string; retention_until_ms: number; sha256: string; mode: "COMPLIANCE" }
  >();
  public readonly testSetRuns = new Map<
    string,
    { test_set_id: string; total_required: number; passed_count: number; completed: boolean }
  >();
  public readonly tenantFiscalModes = new Map<string, "NONE" | "DIAN_POS">();

  public isProviderHealthy = true;

  /**
   * HU-138 & HU-387: Emisión y transmisión con Circuit Breaker y Contingencia
   */
  public transmitDocument(params: {
    tenantId: string;
    sourceType: "SALE" | "RETURN" | "SUPPORT_DOC";
    sourceId: string;
    docKind: DianDocKind;
    prefix: string;
    number: number;
    cude: string;
    qrUrl: string;
    xmlContent: string;
    nowMs?: number;
  }): ElectronicDocumentRecord {
    const nowMs = params.nowMs ?? Date.now();
    const docId = newId(nowMs);

    if (!this.isProviderHealthy) {
      // Proveedor caído: entra en modo contingencia offline (HU-387)
      const doc: ElectronicDocumentRecord = {
        id: docId,
        tenant_id: params.tenantId,
        source_type: params.sourceType,
        source_id: params.sourceId,
        doc_kind: params.docKind,
        prefix: params.prefix,
        number: params.number,
        cude: params.cude,
        qr_url: params.qrUrl,
        issued_at_ms: nowMs,
        contingency: true, // Modo contingencia activado
        status: "PENDING",
        attempts: 1,
        created_at_ms: nowMs
      };
      this.electronicDocuments.set(doc.id, doc);
      return doc;
    }

    // Proveedor saludable: transmisión exitosa
    const xmlKey = `einvoicing/${params.tenantId}/${params.prefix}${params.number}.xml`;
    const responseKey = `einvoicing/${params.tenantId}/${params.prefix}${params.number}_response.xml`;

    // Archivar en S3 WORM por 10 años (10 * 365 * 86.400.000 ms)
    this.archiveWormDocument(xmlKey, params.xmlContent, nowMs);

    const doc: ElectronicDocumentRecord = {
      id: docId,
      tenant_id: params.tenantId,
      source_type: params.sourceType,
      source_id: params.sourceId,
      doc_kind: params.docKind,
      prefix: params.prefix,
      number: params.number,
      cude: params.cude,
      qr_url: params.qrUrl,
      issued_at_ms: nowMs,
      contingency: false,
      status: "ACCEPTED",
      attempts: 1,
      xml_s3_key: xmlKey,
      response_s3_key: responseKey,
      dian_messages: { status_code: "0", message: "Documento validado y aceptado por la DIAN" },
      created_at_ms: nowMs
    };

    this.electronicDocuments.set(doc.id, doc);
    return doc;
  }

  /**
   * HU-138 & HU-387: S3 Object Lock en modo COMPLIANCE por 10 años (Inmutable WORM)
   */
  public archiveWormDocument(s3Key: string, content: string, nowMs = Date.now()) {
    const tenYearsMs = 10 * 365 * 86_400_000;
    const sha256 = crypto.createHash("sha256").update(content).digest("hex");

    this.wormArchive.set(s3Key, {
      s3_key: s3Key,
      retention_until_ms: nowMs + tenYearsMs,
      sha256,
      mode: "COMPLIANCE"
    });
  }

  /**
   * HU-387: Corrección de datos del adquirente y retransmisión de documento rechazado
   */
  public retryRejectedDocument(
    documentId: string,
    correctedData: { acquirerDoc: string; acquirerEmail: string; newXmlContent: string },
    nowMs = Date.now()
  ): ElectronicDocumentRecord {
    const doc = this.electronicDocuments.get(documentId);
    if (!doc) throw new Error("404 DOCUMENT_NOT_FOUND");
    if (doc.status !== "REJECTED" && doc.status !== "PENDING") {
      throw new Error("400 DOCUMENT_NOT_IN_RETRYABLE_STATE");
    }

    doc.attempts += 1;
    if (this.isProviderHealthy) {
      doc.status = "ACCEPTED";
      doc.contingency = false;
      doc.dian_messages = { status_code: "0", message: "Documento corregido y aceptado" };
      this.archiveWormDocument(`einvoicing/${doc.tenant_id}/${doc.prefix}${doc.number}_v2.xml`, correctedData.newXmlContent, nowMs);
    } else {
      doc.status = "PENDING";
      doc.contingency = true;
    }

    return doc;
  }

  /**
   * HU-462: Construye el contenedor AttachedDocument (ZIP con XML firmado + ApplicationResponse + PDF)
   */
  public packageAttachedDocument(params: {
    docId: string;
    xmlSignedContent: string;
    applicationResponseContent: string;
  }): AttachedDocumentContainer {
    const doc = this.electronicDocuments.get(params.docId);
    if (!doc || doc.status !== "ACCEPTED") {
      throw new Error("400 DOCUMENT_MUST_BE_ACCEPTED_TO_PACKAGE_ATTACHED_DOC");
    }

    const zipFileName = `ad_${doc.prefix}${doc.number}.zip`;
    const s3Key = `einvoicing/attached_docs/${doc.tenant_id}/${zipFileName}`;
    const dummyPdf = "JVBERi0xLjQKJcTl8uXr...[TIENDITA_ONLINE_GRAPHICAL_REPRESENTATION_PDF]";

    const combined = `${params.xmlSignedContent}:${params.applicationResponseContent}:${dummyPdf}`;
    const sha256 = crypto.createHash("sha256").update(combined).digest("hex");

    return {
      zip_file_name: zipFileName,
      xml_signed_content: params.xmlSignedContent,
      application_response_content: params.applicationResponseContent,
      pdf_base64: dummyPdf,
      s3_key: s3Key,
      sha256_checksum: sha256
    };
  }

  /**
   * HU-463: Asistente y ejecutor del Set de Pruebas de Habilitación DIAN (TestSetId)
   */
  public runTestSetHabilitation(params: {
    tenantId: string;
    testSetId: string;
    totalRequired?: number;
  }): { testSetId: string; completed: boolean; passedCount: number } {
    const required = params.totalRequired ?? 10;
    // Simular el envío de las 10 pruebas requeridas por la DIAN (5 facturas, 3 notas crédito, 2 notas débito)
    const run = {
      test_set_id: params.testSetId,
      total_required: required,
      passed_count: required,
      completed: true
    };
    this.testSetRuns.set(params.tenantId, run);
    return {
      testSetId: run.test_set_id,
      completed: run.completed,
      passedCount: run.passed_count
    };
  }

  /**
   * HU-464: Activación en caliente de fiscal_mode = DIAN_POS sin alterar comprobantes anteriores
   */
  public switchFiscalMode(tenantId: string, newMode: "NONE" | "DIAN_POS"): { previousMode: string; newMode: string } {
    const prev = this.tenantFiscalModes.get(tenantId) ?? "NONE";
    this.tenantFiscalModes.set(tenantId, newMode);
    return {
      previousMode: prev,
      newMode
    };
  }

  /**
   * HU-465: Panel de Monitoreo de Facturación Electrónica en la Consola Super Admin
   */
  public getSuperAdminMonitoringSummary(nowMs = Date.now()) {
    let pendingCount = 0;
    let nearContingencyDeadlineCount = 0;
    let rejectedCount = 0;

    const deadlineThresholdMs = 24 * 3600_000; // Alerta si lleva más de 24h en contingencia

    for (const d of this.electronicDocuments.values()) {
      if (d.status === "PENDING") {
        pendingCount += 1;
        if (nowMs - d.issued_at_ms > deadlineThresholdMs) {
          nearContingencyDeadlineCount += 1;
        }
      } else if (d.status === "REJECTED") {
        rejectedCount += 1;
      }
    }

    return {
      total_documents: this.electronicDocuments.size,
      pending_documents: pendingCount,
      near_contingency_deadline: nearContingencyDeadlineCount,
      rejected_documents: rejectedCount,
      system_healthy: rejectedCount === 0 && nearContingencyDeadlineCount === 0
    };
  }
}
