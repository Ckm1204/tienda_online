-- reporting-service: modelos de lectura (CQRS) para el POS (modo reportes) y la app web/móvil.
-- Reconstruibles reproduciendo los tópicos de Kafka desde el inicio.

CREATE TABLE rpt_daily_sales (
  tenant_id      uuid NOT NULL,
  branch_id      uuid NOT NULL,
  terminal_id    uuid NOT NULL,
  day            date NOT NULL,                     -- fecha local America/Bogota
  tickets        int NOT NULL DEFAULT 0,
  gross_total    numeric(16,2) NOT NULL DEFAULT 0,
  discount_total numeric(16,2) NOT NULL DEFAULT 0,
  tax_total      numeric(16,2) NOT NULL DEFAULT 0,
  returns_total  numeric(16,2) NOT NULL DEFAULT 0,
  credit_total   numeric(16,2) NOT NULL DEFAULT 0,
  by_payment     jsonb NOT NULL DEFAULT '{}',       -- {"CASH":..., "NEQUI":...}
  PRIMARY KEY (tenant_id, branch_id, terminal_id, day)
);

CREATE TABLE rpt_hourly_sales (
  tenant_id  uuid NOT NULL,
  branch_id  uuid NOT NULL,
  hour       timestamptz NOT NULL,
  tickets    int NOT NULL DEFAULT 0,
  total      numeric(16,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, branch_id, hour)
);

CREATE TABLE rpt_product_sales_daily (
  tenant_id  uuid NOT NULL,
  branch_id  uuid NOT NULL,
  product_id uuid NOT NULL,
  day        date NOT NULL,
  quantity   numeric(16,3) NOT NULL DEFAULT 0,
  revenue    numeric(16,2) NOT NULL DEFAULT 0,
  cost       numeric(16,2),
  PRIMARY KEY (tenant_id, branch_id, product_id, day)
);

CREATE TABLE rpt_shift_summary (
  tenant_id       uuid NOT NULL,
  cash_session_id uuid PRIMARY KEY,
  branch_id       uuid NOT NULL,
  terminal_id     uuid NOT NULL,
  cashier_id      uuid NOT NULL,
  opened_at       timestamptz NOT NULL,
  closed_at       timestamptz,
  expected_cash   numeric(14,2),
  declared_cash   numeric(14,2),
  difference      numeric(14,2),
  status          text NOT NULL
);

CREATE TABLE rpt_terminal_status (
  tenant_id         uuid NOT NULL,
  terminal_id       uuid PRIMARY KEY,
  branch_id         uuid NOT NULL,
  code              text NOT NULL,
  last_heartbeat_at timestamptz,
  pending_outbox    int,
  oldest_pending_at timestamptz,
  app_version       text
);

CREATE TABLE rpt_inventory_alerts (
  tenant_id    uuid NOT NULL,
  branch_id    uuid NOT NULL,
  product_id   uuid NOT NULL,
  kind         text NOT NULL,                       -- LOW|NEGATIVE
  on_hand      numeric(14,3) NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, branch_id, product_id, kind)
);

CREATE TABLE rpt_dimensions (                       -- nombres de productos/sucursales/cajeros para mostrar
  tenant_id  uuid NOT NULL,
  dim        text NOT NULL,                         -- product|branch|user|terminal|category
  id         uuid NOT NULL,
  name       text NOT NULL,
  extra      jsonb,
  PRIMARY KEY (tenant_id, dim, id)
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['rpt_daily_sales','rpt_hourly_sales','rpt_product_sales_daily','rpt_shift_summary',
                           'rpt_terminal_status','rpt_inventory_alerts','rpt_dimensions'] LOOP
    PERFORM app.enable_tenant_rls(t::regclass);
  END LOOP;
END $$;
-- Fase posterior: ClickHouse para análisis histórico pesado.
