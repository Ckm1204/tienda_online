-- customer-service: clientes y cartera (fiados).

CREATE TABLE customers (
  id               uuid PRIMARY KEY,
  tenant_id        uuid NOT NULL,
  person_type      text NOT NULL DEFAULT 'NATURAL',
  doc_type         text,                            -- opcional en tienda de barrio (cliente por alias)
  doc_number       text,
  dv               smallint,
  full_name        text NOT NULL,
  alias            text,                            -- "Doña Marta - casa azul"
  phone            text,
  email            citext,
  address          text,
  credit_enabled   boolean NOT NULL DEFAULT false,
  credit_limit     numeric(14,2) NOT NULL DEFAULT 0,
  credit_mode      text NOT NULL DEFAULT 'SOFT',    -- SOFT|ALLOCATED|ONLINE_ONLY
  data_consent_at  timestamptz,
  data_consent_ref text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  row_xid          xid8 NOT NULL DEFAULT pg_current_xact_id(),
  deleted_at       timestamptz
);
CREATE UNIQUE INDEX ON customers (tenant_id, doc_type, doc_number) WHERE doc_number IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE credit_movements (
  id           uuid PRIMARY KEY,
  tenant_id    uuid NOT NULL,
  customer_id  uuid NOT NULL REFERENCES customers(id),
  branch_id    uuid NOT NULL,
  terminal_id  uuid,
  kind         text NOT NULL,                       -- CHARGE|PAYMENT|ADJUSTMENT|WRITE_OFF
  amount       numeric(14,2) NOT NULL,              -- + cargo, - abono
  sale_id      uuid,
  occurred_at  timestamptz NOT NULL,
  created_by   uuid NOT NULL,
  received_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON credit_movements (tenant_id, customer_id, occurred_at);

CREATE TABLE customer_balances (
  tenant_id    uuid NOT NULL,
  customer_id  uuid NOT NULL,
  balance      numeric(14,2) NOT NULL DEFAULT 0,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, customer_id)
);

CREATE TRIGGER trg_touch BEFORE INSERT OR UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION app.touch_row();
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['customers','credit_movements','customer_balances'] LOOP
    PERFORM app.enable_tenant_rls(t::regclass);
  END LOOP;
END $$;
-- Consume: pos.events (customer.*, sale.completed con fiado, credit.payment.received, sale.returned)
-- Publica: customer.upserted, customer.balance_changed, customer.credit_limit_exceeded
