import type { DianDocKind } from "./types.js";

/**
 * HU-138, HU-386, HU-460, HU-461: Generador y Validador de XML UBL 2.1 para la DIAN
 * - Documento Equivalente POS Electrónico (InvoiceTypeCode = 20)
 * - Factura Electrónica de Venta (InvoiceTypeCode = 01)
 * - Nota Crédito / Nota de Ajuste POS (CreditNote con BillingReference)
 * - Documento Soporte Electrónico (SUPPORT_DOC)
 * - Catálogos oficiales DIAN: Unidades UNECE Rec 20, Tributos (01 IVA, 04 INC), Medios de Pago
 */

export interface UblLineItem {
  id: string;
  name: string;
  qty_milli: number;
  unit_code: "H87" | "KGM"; // H87: Unidad, KGM: Kilogramo
  unit_price_cents: number;
  total_cents: number;
  tax_kind: "01" | "04";    // 01: IVA, 04: INC
  tax_rate_bp: number;      // 1900 para 19 %, 800 para 8 %
  tax_amount_cents: number;
}

export interface UblDocumentData {
  kind: DianDocKind;
  prefix: string;
  number: number;
  cude: string;
  issue_date: string;
  issue_time: string;
  issuer: {
    nit: string;
    dv: string;
    legal_name: string;
    trade_name: string;
    address: string;
    city_code: string; // ej. 11001 Bogotá
  };
  acquirer: {
    doc_type: "31" | "13" | "222222222222"; // 31: NIT, 13: CC, 222222222222: Consumidor Final
    doc_number: string;
    name: string;
    email?: string;
  };
  billing_reference?: {
    original_cude: string;
    original_number: string;
    original_issue_date: string;
  };
  payment_mean: "10" | "31" | "48"; // 10: Efectivo, 31: Transferencia, 48: Crédito
  lines: UblLineItem[];
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
}

export class UblBuilder {
  /**
   * HU-386: Construye el XML UBL 2.1 correspondiente al documento fiscal
   */
  public static buildUblXml(doc: UblDocumentData): string {
    const isCreditOrAdjustment = doc.kind === "CREDIT_NOTE" || doc.kind === "ADJUSTMENT_NOTE";
    const rootTag = isCreditOrAdjustment ? "CreditNote" : "Invoice";
    const typeCode = doc.kind === "POS_EQUIVALENT" || doc.kind === "ADJUSTMENT_NOTE" ? "20" : "01";

    const linesXml = doc.lines
      .map((line, idx) => {
        const qty = (line.qty_milli / 1000).toFixed(3);
        const price = (line.unit_price_cents / 100).toFixed(2);
        const lineTotal = (line.total_cents / 100).toFixed(2);
        const taxAmount = (line.tax_amount_cents / 100).toFixed(2);
        const percent = (line.tax_rate_bp / 100).toFixed(2);

        return `
    <cac:${isCreditOrAdjustment ? "CreditNoteLine" : "InvoiceLine"}>
      <cbc:ID>${idx + 1}</cbc:ID>
      <cbc:${isCreditOrAdjustment ? "CreditedQuantity" : "InvoicedQuantity"} unitCode="${line.unit_code}">${qty}</cbc:${isCreditOrAdjustment ? "CreditedQuantity" : "InvoicedQuantity"}>
      <cbc:LineExtensionAmount currencyID="COP">${lineTotal}</cbc:LineExtensionAmount>
      <cac:TaxTotal>
        <cbc:TaxAmount currencyID="COP">${taxAmount}</cbc:TaxAmount>
        <cac:TaxSubtotal>
          <cbc:TaxableAmount currencyID="COP">${lineTotal}</cbc:TaxableAmount>
          <cbc:TaxAmount currencyID="COP">${taxAmount}</cbc:TaxAmount>
          <cac:TaxCategory>
            <cbc:Percent>${percent}</cbc:Percent>
            <cac:TaxScheme>
              <cbc:ID>${line.tax_kind}</cbc:ID>
              <cbc:Name>${line.tax_kind === "01" ? "IVA" : "INC"}</cbc:Name>
            </cac:TaxScheme>
          </cac:TaxCategory>
        </cac:TaxSubtotal>
      </cac:TaxTotal>
      <cac:Item>
        <cbc:Description>${this.escapeXml(line.name)}</cbc:Description>
      </cac:Item>
      <cac:Price>
        <cbc:PriceAmount currencyID="COP">${price}</cbc:PriceAmount>
      </cac:Price>
    </cac:${isCreditOrAdjustment ? "CreditNoteLine" : "InvoiceLine"}>`;
      })
      .join("");

    const billingRefXml = doc.billing_reference
      ? `
  <cac:BillingReference>
    <cac:InvoiceDocumentReference>
      <cbc:ID>${doc.billing_reference.original_number}</cbc:ID>
      <cbc:UUID schemeName="CUDE-SHA384">${doc.billing_reference.original_cude}</cbc:UUID>
      <cbc:IssueDate>${doc.billing_reference.original_issue_date}</cbc:IssueDate>
    </cac:InvoiceDocumentReference>
  </cac:BillingReference>`
      : "";

    return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<${rootTag} xmlns="urn:oasis:names:specification:ubl:schema:xsd:${rootTag}-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:UBLVersionID>UBL 2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>10</cbc:CustomizationID>
  <cbc:ProfileID>DIAN 2.1</cbc:ProfileID>
  <cbc:ID>${doc.prefix}${doc.number}</cbc:ID>
  <cbc:UUID schemeName="CUDE-SHA384">${doc.cude}</cbc:UUID>
  <cbc:IssueDate>${doc.issue_date}</cbc:IssueDate>
  <cbc:IssueTime>${doc.issue_time}</cbc:IssueTime>
  <cbc:${isCreditOrAdjustment ? "CreditNoteTypeCode" : "InvoiceTypeCode"}>${typeCode}</cbc:${isCreditOrAdjustment ? "CreditNoteTypeCode" : "InvoiceTypeCode"}>
  ${billingRefXml}
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyName>
        <cbc:Name>${this.escapeXml(doc.issuer.trade_name)}</cbc:Name>
      </cac:PartyName>
      <cac:PartyTaxScheme>
        <cbc:RegistrationName>${this.escapeXml(doc.issuer.legal_name)}</cbc:RegistrationName>
        <cbc:CompanyID schemeAgencyID="195" schemeID="${doc.issuer.dv}">${doc.issuer.nit}</cbc:CompanyID>
        <cac:TaxScheme>
          <cbc:ID>01</cbc:ID>
          <cbc:Name>IVA</cbc:Name>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyTaxScheme>
        <cbc:RegistrationName>${this.escapeXml(doc.acquirer.name)}</cbc:RegistrationName>
        <cbc:CompanyID schemeAgencyID="195">${doc.acquirer.doc_number}</cbc:CompanyID>
      </cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>${doc.payment_mean}</cbc:PaymentMeansCode>
  </cac:PaymentMeans>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="COP">${(doc.subtotal_cents / 100).toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxInclusiveAmount currencyID="COP">${(doc.total_cents / 100).toFixed(2)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="COP">${(doc.total_cents / 100).toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  ${linesXml}
</${rootTag}>`;
  }

  /**
   * HU-386: Validador de formato y campos requeridos para UBL 2.1
   */
  public static validateUblStructure(xmlString: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!xmlString.includes("<cbc:UBLVersionID>UBL 2.1</cbc:UBLVersionID>")) {
      errors.push("Falta UBLVersionID 2.1");
    }
    if (!xmlString.includes("<cbc:UUID schemeName=\"CUDE-SHA384\">")) {
      errors.push("Falta UUID con schemeName CUDE-SHA384");
    }
    if (!xmlString.includes("<cac:AccountingSupplierParty>")) {
      errors.push("Falta AccountingSupplierParty");
    }
    if (!xmlString.includes("<cac:AccountingCustomerParty>")) {
      errors.push("Falta AccountingCustomerParty");
    }
    if (!xmlString.includes("<cac:LegalMonetaryTotal>")) {
      errors.push("Falta LegalMonetaryTotal");
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  private static escapeXml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }
}
