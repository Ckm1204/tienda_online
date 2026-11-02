import { z } from "zod";
import { canonicalSha256 } from "./canonical-and-uuid.js";

/**
 * HU-006: Esquema Zod del sobre de evento (EventEnvelope) con hash canónico y HLC.
 * HU-374: Todos los esquemas usan `.strict()` para impedir Mass Assignment.
 */
export const EventEnvelopeSchema = z
  .object({
    event_id: z.string().uuid(),
    event_type: z.string().min(3),
    schema_version: z.number().int().positive(),
    tenant_id: z.string().uuid(),
    branch_id: z.string().uuid(),
    terminal_id: z.string().uuid(),
    terminal_seq: z.number().int().positive(),
    occurred_at: z.string().datetime({ offset: true }),
    hlc: z.string().min(5),
    actor_id: z.string().uuid(),
    payload: z.unknown(),
    payload_hash: z.string().regex(/^sha256:[0-9a-f]{64}$/)
  })
  .strict()
  .superRefine((env, ctx) => {
    const expectedHash = canonicalSha256(env.payload);
    if (env.payload_hash !== expectedHash) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["payload_hash"],
        message: `payload_hash mismatch: expected ${expectedHash}, got ${env.payload_hash}`
      });
    }
  });

export type EventEnvelope = z.infer<typeof EventEnvelopeSchema>;

export function createEventEnvelope<TPayload>(params: {
  event_id: string;
  event_type: string;
  schema_version: number;
  tenant_id: string;
  branch_id: string;
  terminal_id: string;
  terminal_seq: number;
  occurred_at: string;
  hlc: string;
  actor_id: string;
  payload: TPayload;
}): EventEnvelope {
  const payload_hash = canonicalSha256(params.payload);
  return EventEnvelopeSchema.parse({
    ...params,
    payload_hash
  });
}

// ============================================================================
// HU-007 & HU-145..HU-149: Esquemas Zod de todos los eventos de subida del POS (v1)
// ============================================================================

// HU-145: CashSessionOpenedV1 y CashSessionClosedV1
export const CashSessionOpenedV1Schema = z
  .object({
    cash_session_id: z.string().uuid(),
    opened_by: z.string().uuid(),
    opened_at: z.string().datetime({ offset: true }),
    opening_float_cents: z.number().int().nonnegative(),
    opening_denominations: z.record(z.string(), z.number().int().nonnegative()).optional()
  })
  .strict();

export const CashSessionClosedV1Schema = z
  .object({
    cash_session_id: z.string().uuid(),
    closed_by: z.string().uuid(),
    closed_at: z.string().datetime({ offset: true }),
    opening_float_cents: z.number().int().nonnegative(),
    expected_cash_cents: z.number().int(),
    declared_cash_cents: z.number().int().nonnegative(),
    difference_cents: z.number().int(),
    declared_denominations: z.record(z.string(), z.number().int().nonnegative()),
    declared_other_methods_cents: z.record(z.string(), z.number().int().nonnegative()).default({})
  })
  .strict()
  .superRefine((val, ctx) => {
    const expectedDiff = val.declared_cash_cents - val.expected_cash_cents;
    if (val.difference_cents !== expectedDiff) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["difference_cents"],
        message: `difference_cents (${val.difference_cents}) must equal declared_cash_cents - expected_cash_cents (${expectedDiff})`
      });
    }
  });

// HU-146: CashMovementRecordedV1 y CashSessionReopenedV1
export const CashMovementKindSchema = z.enum([
  "CASH_IN",
  "CASH_OUT",
  "EXPENSE",
  "SUPPLIER_PAYMENT",
  "SAFE_DROP"
]);

export const CashMovementRecordedV1Schema = z
  .object({
    movement_id: z.string().uuid(),
    cash_session_id: z.string().uuid(),
    kind: CashMovementKindSchema,
    amount_cents: z.number().int().positive(),
    reason: z.string().trim().min(3),
    approved_by: z.string().uuid().nullable(),
    created_by: z.string().uuid(),
    occurred_at: z.string().datetime({ offset: true })
  })
  .strict();

export const CashSessionReopenedV1Schema = z
  .object({
    cash_session_id: z.string().uuid(),
    reopened_by: z.string().uuid(),
    approved_by: z.string().uuid(),
    reason: z.string().trim().min(3),
    occurred_at: z.string().datetime({ offset: true })
  })
  .strict();

// HU-007: SaleCompletedV1
export const PaymentMethodSchema = z.enum([
  "CASH",
  "DEBIT",
  "CREDIT_CARD",
  "NEQUI",
  "DAVIPLATA",
  "BRE_B",
  "TRANSFER",
  "CREDIT_ACCOUNT"
]);

export const SaleTaxDetailItemSchema = z
  .object({
    tax_code: z.string().min(2),
    kind: z.enum(["PERCENT", "FIXED_PER_UNIT"]),
    rate_bp: z.number().int().nonnegative(),
    base_cents: z.number().int().nonnegative(),
    tax_cents: z.number().int().nonnegative()
  })
  .strict();

export const SaleLineItemV1Schema = z
  .object({
    line_id: z.string().uuid(),
    line_no: z.number().int().positive(),
    product_id: z.string().uuid(),
    description: z.string().min(1),
    qty_milli: z.number().int().positive(),
    unit_price_cents: z.number().int().nonnegative(),
    discount_cents: z.number().int().nonnegative(),
    tax_detail: z.array(SaleTaxDetailItemSchema),
    line_total_cents: z.number().int().nonnegative(),
    is_generic_item: z.boolean().default(false)
  })
  .strict();

export const SalePaymentItemV1Schema = z
  .object({
    payment_id: z.string().uuid(),
    method: PaymentMethodSchema,
    amount_cents: z.number().int().positive(),
    tendered_cents: z.number().int().nonnegative().nullable(),
    change_cents: z.number().int().nonnegative().nullable(),
    reference: z.string().nullable()
  })
  .strict();

export const SaleCompletedV1Schema = z
  .object({
    sale_id: z.string().uuid(),
    receipt_prefix: z.string().min(1),
    receipt_number: z.number().int().positive(),
    cash_session_id: z.string().uuid(),
    cashier_id: z.string().uuid(),
    customer_id: z.string().uuid().nullable(),
    lines: z.array(SaleLineItemV1Schema).min(1),
    payments: z.array(SalePaymentItemV1Schema).min(1),
    totals: z
      .object({
        subtotal_cents: z.number().int().nonnegative(),
        discount_cents: z.number().int().nonnegative(),
        tax_cents: z.number().int().nonnegative(),
        rounding_cents: z.number().int(),
        total_cents: z.number().int().positive()
      })
      .strict(),
    is_credit: z.boolean()
  })
  .strict()
  .superRefine((sale, ctx) => {
    const paidSum = sale.payments.reduce((acc, p) => acc + p.amount_cents, 0);
    if (paidSum !== sale.totals.total_cents) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["payments"],
        message: `Sum of payments (${paidSum}) must equal totals.total_cents (${sale.totals.total_cents})`
      });
    }
    const hasCreditPayment = sale.payments.some((p) => p.method === "CREDIT_ACCOUNT");
    if (sale.is_credit && !sale.customer_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["customer_id"],
        message: "Credit sale requires customer_id"
      });
    }
    if (hasCreditPayment !== sale.is_credit) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["is_credit"],
        message: "is_credit flag must match presence of CREDIT_ACCOUNT payment"
      });
    }
  });

// HU-147: SaleVoidedV1 y SaleReturnedV1
export const SaleVoidedV1Schema = z
  .object({
    return_id: z.string().uuid(),
    original_sale_id: z.string().uuid(),
    cash_session_id: z.string().uuid(),
    requested_by: z.string().uuid(),
    approved_by: z.string().uuid(),
    self_approved: z.boolean().default(false),
    reason: z.string().trim().min(3),
    refund_total_cents: z.number().int().positive(),
    refund_method: PaymentMethodSchema,
    occurred_at: z.string().datetime({ offset: true })
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.requested_by === v.approved_by && !v.self_approved) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["approved_by"],
        message: "approved_by must differ from requested_by unless self_approved (OWNER in Tendero)"
      });
    }
  });

export const SaleReturnedLineV1Schema = z
  .object({
    product_id: z.string().uuid(),
    qty_milli: z.number().int().positive(),
    refund_line_cents: z.number().int().nonnegative()
  })
  .strict();

export const SaleReturnedV1Schema = z
  .object({
    return_id: z.string().uuid(),
    original_sale_id: z.string().uuid().nullable(),
    manual_receipt_ref: z.string().nullable().optional(),
    cash_session_id: z.string().uuid(),
    kind: z.enum(["PARTIAL_RETURN", "FULL_RETURN"]),
    requested_by: z.string().uuid(),
    approved_by: z.string().uuid(),
    self_approved: z.boolean().default(false),
    reason: z.string().trim().min(3),
    lines: z.array(SaleReturnedLineV1Schema).min(1),
    refund_total_cents: z.number().int().nonnegative(),
    refund_method: PaymentMethodSchema,
    occurred_at: z.string().datetime({ offset: true })
  })
  .strict()
  .superRefine((r, ctx) => {
    if (!r.original_sale_id && !r.manual_receipt_ref) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["original_sale_id"],
        message: "Either original_sale_id or manual_receipt_ref is required"
      });
    }
    if (r.requested_by === r.approved_by && !r.self_approved) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["approved_by"],
        message: "approved_by must differ from requested_by unless self_approved"
      });
    }
  });

// HU-148: CustomerCreatedV1, CustomerUpdatedV1 y CreditPaymentReceivedV1
export const CustomerCreatedV1Schema = z
  .object({
    customer_id: z.string().uuid(),
    full_name: z.string().trim().min(2),
    alias: z.string().trim().nullable(),
    doc_type: z.enum(["CC", "NIT", "CE", "PPT", "TI", "PA"]).nullable(),
    doc_number: z.string().trim().nullable(),
    phone: z.string().trim().nullable(),
    email: z.string().email().nullable(),
    data_consent_at: z.string().datetime({ offset: true }).nullable(),
    created_at: z.string().datetime({ offset: true })
  })
  .strict()
  .superRefine((c, ctx) => {
    if ((c.phone || c.email) && !c.data_consent_at) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["data_consent_at"],
        message: "Habeas Data (Ley 1581): data_consent_at es obligatorio cuando se registra teléfono o email"
      });
    }
  });

export const CustomerUpdatedV1Schema = z
  .object({
    customer_id: z.string().uuid(),
    full_name: z.string().trim().min(2).optional(),
    alias: z.string().trim().nullable().optional(),
    phone: z.string().trim().nullable().optional(),
    email: z.string().email().nullable().optional(),
    data_consent_at: z.string().datetime({ offset: true }).optional(),
    updated_at: z.string().datetime({ offset: true })
  })
  .strict();

export const CreditPaymentReceivedV1Schema = z
  .object({
    movement_id: z.string().uuid(),
    customer_id: z.string().uuid(),
    cash_session_id: z.string().uuid(),
    amount_cents: z.number().int().positive(),
    method: z.enum(["CASH", "DEBIT", "CREDIT_CARD", "NEQUI", "DAVIPLATA", "BRE_B", "TRANSFER"]),
    reference: z.string().nullable(),
    received_by: z.string().uuid(),
    occurred_at: z.string().datetime({ offset: true })
  })
  .strict();

// HU-149: AuditRecordedV1 con encadenamiento de hashes
export const AuditRecordedV1Schema = z
  .object({
    audit_id: z.string().uuid(),
    action: z.string().min(3),
    actor_id: z.string().uuid().nullable(),
    approved_by: z.string().uuid().nullable(),
    entity_type: z.string().nullable(),
    entity_id: z.string().uuid().nullable(),
    data: z.record(z.string(), z.unknown()),
    occurred_at: z.string().datetime({ offset: true }),
    prev_hash: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
    hash: z.string().regex(/^[0-9a-f]{64}$/)
  })
  .strict();

export const POS_UPSTREAM_EVENT_SCHEMAS = {
  "cash.session.opened": CashSessionOpenedV1Schema,
  "cash.session.closed": CashSessionClosedV1Schema,
  "cash.session.reopened": CashSessionReopenedV1Schema,
  "cash.movement.recorded": CashMovementRecordedV1Schema,
  "sale.completed": SaleCompletedV1Schema,
  "sale.voided": SaleVoidedV1Schema,
  "sale.returned": SaleReturnedV1Schema,
  "customer.created": CustomerCreatedV1Schema,
  "customer.updated": CustomerUpdatedV1Schema,
  "credit.payment.received": CreditPaymentReceivedV1Schema,
  "audit.recorded": AuditRecordedV1Schema
} as const;
