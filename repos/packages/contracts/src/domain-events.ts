import { z } from "zod";

/**
 * HU-150: Contratos Zod de eventos internos de dominio que viajan por Kafka entre microservicios:
 * `catalog.*`, `user.*`, `tenant.*`, `device.*`, `sales.*`, `inventory.*`, `customer.*`, `cash.*`.
 */

export const TenantCreatedEventSchema = z
  .object({
    tenant_id: z.string().uuid(),
    legal_name: z.string().min(2),
    plan_code: z.enum(["TENDERO", "NEGOCIO", "MULTITIENDA"]),
    status: z.enum(["TRIAL", "ACTIVE", "PAST_DUE", "RESTRICTED", "SUSPENDED", "CANCELLED"]),
    fiscal_mode: z.enum(["NONE", "DIAN_POS", "DIAN_INVOICE"]),
    created_at: z.string().datetime({ offset: true })
  })
  .strict();

export const TenantStatusChangedEventSchema = z
  .object({
    tenant_id: z.string().uuid(),
    from_status: z.string().nullable(),
    to_status: z.enum(["TRIAL", "ACTIVE", "PAST_DUE", "RESTRICTED", "SUSPENDED", "CANCELLED"]),
    paid_until: z.string().nullable(),
    reason: z.string().min(2),
    changed_at: z.string().datetime({ offset: true })
  })
  .strict();

export const TenantEntitlementsChangedEventSchema = z
  .object({
    tenant_id: z.string().uuid(),
    plan_code: z.enum(["TENDERO", "NEGOCIO", "MULTITIENDA"]),
    max_branches: z.number().int().positive().nullable(),
    max_terminals: z.number().int().positive().nullable(),
    max_users: z.number().int().positive().nullable(),
    max_products: z.number().int().positive().nullable(),
    max_credit_customers: z.number().int().positive().nullable(),
    allowed_roles: z.array(z.string()),
    features: z.record(z.string(), z.boolean()),
    grace_days: z.number().int().positive(),
    updated_at: z.string().datetime({ offset: true })
  })
  .strict();

export const UserUpsertedEventSchema = z
  .object({
    tenant_id: z.string().uuid(),
    user_id: z.string().uuid(),
    full_name: z.string().min(2),
    pin_hash: z.string().nullable(),
    status: z.enum(["ACTIVE", "LOCKED", "DISABLED"]),
    role_codes: z.array(z.string()),
    permissions: z.array(z.string()),
    branch_id: z.string().uuid().nullable(),
    source_version: z.number().int().positive()
  })
  .strict();

export const TerminalEnrolledEventSchema = z
  .object({
    tenant_id: z.string().uuid(),
    branch_id: z.string().uuid(),
    terminal_id: z.string().uuid(),
    code: z.string().min(2),
    enrolled_at: z.string().datetime({ offset: true })
  })
  .strict();

export const TerminalStaleEventSchema = z
  .object({
    tenant_id: z.string().uuid(),
    branch_id: z.string().uuid(),
    terminal_id: z.string().uuid(),
    code: z.string(),
    last_heartbeat_at: z.string().datetime({ offset: true }).nullable(),
    oldest_pending_at: z.string().datetime({ offset: true }).nullable()
  })
  .strict();

export const CatalogProductUpsertedEventSchema = z
  .object({
    tenant_id: z.string().uuid(),
    product_id: z.string().uuid(),
    sku: z.string().min(1),
    name: z.string().min(1),
    category_id: z.string().uuid().nullable(),
    unit: z.string(),
    is_weighted: z.boolean(),
    track_stock: z.boolean(),
    allow_negative_stock: z.boolean(),
    tax_ids: z.array(z.string().uuid()),
    base_price_cents: z.number().int().nonnegative(),
    status: z.enum(["ACTIVE", "INACTIVE"]),
    source_version: z.number().int().positive()
  })
  .strict();

export const SalesRecordedEventSchema = z
  .object({
    tenant_id: z.string().uuid(),
    branch_id: z.string().uuid(),
    terminal_id: z.string().uuid(),
    sale_id: z.string().uuid(),
    receipt_prefix: z.string(),
    receipt_number: z.number().int().positive(),
    total_cents: z.number().int().positive(),
    tax_cents: z.number().int().nonnegative(),
    discount_cents: z.number().int().nonnegative(),
    is_credit: z.boolean(),
    issued_at: z.string().datetime({ offset: true })
  })
  .strict();

export const InventoryLevelChangedEventSchema = z
  .object({
    tenant_id: z.string().uuid(),
    branch_id: z.string().uuid(),
    warehouse_id: z.string().uuid(),
    product_id: z.string().uuid(),
    on_hand_milli: z.number().int(),
    source_version: z.number().int().positive(),
    updated_at: z.string().datetime({ offset: true })
  })
  .strict();

export const InventoryNegativeDetectedEventSchema = z
  .object({
    tenant_id: z.string().uuid(),
    branch_id: z.string().uuid(),
    warehouse_id: z.string().uuid(),
    product_id: z.string().uuid(),
    on_hand_milli: z.number().int().negative(),
    detected_at: z.string().datetime({ offset: true })
  })
  .strict();

export const CustomerBalanceChangedEventSchema = z
  .object({
    tenant_id: z.string().uuid(),
    customer_id: z.string().uuid(),
    balance_cents: z.number().int(),
    credit_limit_cents: z.number().int().nonnegative(),
    exceeded_limit: z.boolean(),
    source_version: z.number().int().positive()
  })
  .strict();

export const CashDiscrepancyDetectedEventSchema = z
  .object({
    tenant_id: z.string().uuid(),
    branch_id: z.string().uuid(),
    terminal_id: z.string().uuid(),
    cash_session_id: z.string().uuid(),
    cashier_id: z.string().uuid(),
    expected_cash_cents: z.number().int(),
    declared_cash_cents: z.number().int(),
    difference_cents: z.number().int()
  })
  .strict();

export const DOMAIN_EVENT_SCHEMAS = {
  "tenant.created": TenantCreatedEventSchema,
  "tenant.status_changed": TenantStatusChangedEventSchema,
  "tenant.entitlements_changed": TenantEntitlementsChangedEventSchema,
  "user.upserted": UserUpsertedEventSchema,
  "terminal.enrolled": TerminalEnrolledEventSchema,
  "terminal.stale": TerminalStaleEventSchema,
  "catalog.product.upserted": CatalogProductUpsertedEventSchema,
  "sales.recorded": SalesRecordedEventSchema,
  "inventory.level_changed": InventoryLevelChangedEventSchema,
  "inventory.negative_detected": InventoryNegativeDetectedEventSchema,
  "customer.balance_changed": CustomerBalanceChangedEventSchema,
  "cash.discrepancy.detected": CashDiscrepancyDetectedEventSchema
} as const;
