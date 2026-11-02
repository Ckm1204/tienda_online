import { z } from "zod";

export type DianDocKind =
  | "POS_EQUIVALENT"
  | "INVOICE"
  | "CREDIT_NOTE"
  | "ADJUSTMENT_NOTE"
  | "SUPPORT_DOC";

export interface DianResolutionRecord {
  id: string;
  tenant_id: string;
  doc_kind: DianDocKind;
  resolution_number: string;
  prefix: string;
  range_from: number;
  range_to: number;
  valid_from: string; // YYYY-MM-DD
  valid_to: string;   // YYYY-MM-DD
  technical_key_ref: string; // ARN en AWS Secrets Manager (HU-380)
  status: "ACTIVE" | "EXHAUSTED" | "EXPIRED";
  created_at_ms: number;
}

export interface TerminalNumberingBlockRecord {
  id: string;
  tenant_id: string;
  resolution_id: string;
  terminal_id: string;
  block_from: number;
  block_to: number;
  last_used: number;
  status: "ACTIVE" | "STANDBY" | "EXHAUSTED" | "RELEASED";
  assigned_at_ms: number;
}

export interface CudeCalculationInput {
  doc_number: string;
  issue_date: string; // YYYY-MM-DD
  issue_time: string; // HH:mm:ss-05:00
  subtotal_cents: number;
  tax_iva_cents: number;
  tax_inc_cents: number;
  total_cents: number;
  issuer_nit: string;
  acquirer_doc: string;
  technical_key_or_pin: string;
  environment_type: "1" | "2"; // 1: Producción, 2: Pruebas
}

export interface ElectronicDocumentRecord {
  id: string;
  tenant_id: string;
  source_type: "SALE" | "RETURN" | "SUPPORT_DOC";
  source_id: string;
  doc_kind: DianDocKind;
  prefix: string;
  number: number;
  cude: string;
  qr_url: string;
  issued_at_ms: number;
  contingency: boolean;
  status: "PENDING" | "SENT" | "ACCEPTED" | "REJECTED" | "ERROR";
  attempts: number;
  rejection_reason?: string;
  xml_s3_key?: string;
  response_s3_key?: string;
  dian_messages?: Record<string, unknown>;
  created_at_ms: number;
}
