-- sales-service: ventas, líneas, pagos, devoluciones/anulaciones.

CREATE TABLE sales (
  id               uuid NOT NULL,
  tenant_id        uuid NOT NULL,
  branch_id        uuid NOT NULL,
  terminal_id      uuid NOT NULL,
  cash_session_id  uuid NOT NULL,
  cashier_id       uuid NOT NULL,
  customer_id      uuid,
  receipt_prefix   text NOT NULL,                   -- código de la caja (C01)
  receipt_number   bigint NOT NULL,                 -- consecutivo interno por caja
  status           text NOT NULL,                   -- COMPLETED|VOIDED|PARTIALLY_RETURNED|RETURNED
  subtotal         numeric(14,2) NOT NULL,
  discount_total   numeric(14,2) NOT NULL DEFAULT 0,
  tax_total        numeric(14,2) NOT NULL,
  total            numeric(14,2) NOT NULL,
  rounding         numeric(14,2) NOT NULL DEFAULT 0,
  is_credit        boolean NOT NULL DEFAULT false,
  -- Extensión fiscal (módulo futuro de facturación electrónica). NULL mientras fiscal_mode = NONE.
  fiscal_doc_kind  text,                            -- POS_EQUIVALENT|INVOICE
  fiscal_prefix    text,
  fiscal_number    bigint,
  cude             text,
  issued_at        timestamptz NOT NULL,
  received_at      timestamptz NOT NULL DEFAULT now(),
  clock_skew_ms    bigint,
  origin_event_id  uuid NOT NULL,
  PRIMARY KEY (id, issued_at)
) PARTITION BY RANGE (issued_at);
CREATE INDEX ON sales (tenant_id, branch_id, issued_at DESC);
CREATE INDEX ON sales (tenant_id, receipt_prefix, receipt_number);

-- Unicidad global del consecutivo (la tabla particionada no puede garantizarla sin incluir issued_at).
CREATE TABLE sale_receipt_numbers (
  tenant_id      uuid NOT NULL,
  receipt_prefix text NOT NULL,
  receipt_number bigint NOT NULL,
  sale_id        uuid NOT NULL UNIQUE,
  PRIMARY KEY (tenant_id, receipt_prefix, receipt_number)
);

CREATE TABLE sale_lines (
  id           uuid NOT NULL,
  sale_id      uuid NOT NULL,
  tenant_id    uuid NOT NULL,
  line_no      int NOT NULL,
  product_id   uuid NOT NULL,
  description  text NOT NULL,
  quantity     numeric(14,3) NOT NULL,
  unit_price   numeric(14,2) NOT NULL,
  discount     numeric(14,2) NOT NULL DEFAULT 0,
  tax_detail   jsonb NOT NULL,
  line_total   numeric(14,2) NOT NULL,
  issued_at    timestamptz NOT NULL,
  PRIMARY KEY (id, issued_at)
) PARTITION BY RANGE (issued_at);
CREATE INDEX ON sale_lines (tenant_id, sale_id);

CREATE TABLE sale_payments (
  id             uuid PRIMARY KEY,
  sale_id        uuid NOT NULL,
  tenant_id      uuid NOT NULL,
  method         text NOT NULL,                     -- CASH|DEBIT|CREDIT_CARD|NEQUI|DAVIPLATA|BRE_B|TRANSFER|CREDIT_ACCOUNT
  amount         numeric(14,2) NOT NULL,
  tendered       numeric(14,2),
  change_given   numeric(14,2),
  reference      text,
  reconciliation text NOT NULL DEFAULT 'NOT_REQUIRED', -- NOT_REQUIRED|PENDING|CONFIRMED|FAILED
  issued_at      timestamptz NOT NULL
);
CREATE INDEX ON sale_payments (tenant_id, sale_id);

CREATE TABLE sale_returns (
  id               uuid PRIMARY KEY,
  tenant_id        uuid NOT NULL,
  original_sale_id uuid NOT NULL,
  branch_id        uuid NOT NULL,
  terminal_id      uuid NOT NULL,
  cash_session_id  uuid NOT NULL,
  kind             text NOT NULL,                   -- VOID|PARTIAL_RETURN|FULL_RETURN
  reason           text NOT NULL,
  approved_by      uuid NOT NULL,
  lines            jsonb NOT NULL,
  refund_total     numeric(14,2) NOT NULL,
  refund_method    text NOT NULL,
  fiscal_note_prefix text,                          -- futuro: nota crédito / ajuste DIAN
  fiscal_note_number bigint,
  occurred_at      timestamptz NOT NULL,
  received_at      timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sales','sale_lines','sale_payments','sale_returns','sale_receipt_numbers'] LOOP
    PERFORM app.enable_tenant_rls(t::regclass);
  END LOOP;
END $$;
-- Consume: pos.events (sale.completed, sale.voided, sale.returned)
-- Publica: sales.recorded, sales.returned, payment.reconciliation_changed
