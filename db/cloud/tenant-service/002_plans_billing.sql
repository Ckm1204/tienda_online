-- tenant-service: planes, add-ons, cobro de la suscripción, avisos de mora y prórrogas.

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS price_yearly       numeric(14,2),
  ADD COLUMN IF NOT EXISTS max_products       int,
  ADD COLUMN IF NOT EXISTS max_credit_customers int,
  ADD COLUMN IF NOT EXISTS allowed_roles      text[] NOT NULL DEFAULT '{OWNER,CASHIER}',
  ADD COLUMN IF NOT EXISTS is_public          boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sort_order         int NOT NULL DEFAULT 0;

-- Estados: TRIAL | ACTIVE | PAST_DUE | RESTRICTED | SUSPENDED | CANCELLED
ALTER TABLE tenants ADD CONSTRAINT tenants_status_chk
  CHECK (status IN ('TRIAL','ACTIVE','PAST_DUE','RESTRICTED','SUSPENDED','CANCELLED'));
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS billing_day     smallint CHECK (billing_day BETWEEN 1 AND 28),
  ADD COLUMN IF NOT EXISTS paid_until      date,
  ADD COLUMN IF NOT EXISTS created_by      uuid;     -- super admin que creó la tienda

-- Precios en COP (sugeridos; editables desde la consola).
INSERT INTO plans (id, code, name, max_branches, max_terminals, max_users, max_products, max_credit_customers,
                   allowed_roles, features, price_monthly, price_yearly, offline_grace_days, sort_order)
VALUES
 (gen_random_uuid(), 'TENDERO', 'Tendero', 1, 1, 2, 3000, 50,
  '{OWNER,CASHIER}',
  '{"credit":true,"inventory_basic":true,"inventory_full":false,"promotions":false,"reports_full":false,
    "export":false,"audit_view":false,"whatsapp_reminders":false,"transfers":false,"custom_roles":false}',
  34900, 349000, 10, 1),
 (gen_random_uuid(), 'NEGOCIO', 'Negocio', 1, 2, 7, NULL, NULL,
  '{OWNER,SUPERVISOR,CASHIER,ACCOUNTANT}',
  '{"credit":true,"credit_modes":true,"inventory_basic":true,"inventory_full":true,"promotions":true,
    "reports_full":true,"export":true,"audit_view":true,"whatsapp_reminders":true,"transfers":false,"custom_roles":false}',
  79900, 799000, 10, 2),
 (gen_random_uuid(), 'MULTITIENDA', 'Multi-tienda', 2, 4, 21, NULL, NULL,
  '{OWNER,BRANCH_ADMIN,SUPERVISOR,CASHIER,ACCOUNTANT}',
  '{"credit":true,"credit_modes":true,"inventory_basic":true,"inventory_full":true,"promotions":true,
    "reports_full":true,"reports_multi_branch":true,"export":true,"audit_view":true,"whatsapp_reminders":true,
    "transfers":true,"custom_roles":true}',
  149900, 1499000, 10, 3)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE addons (
  code          text PRIMARY KEY,                   -- EXTRA_TERMINAL | EXTRA_BRANCH | EXTRA_USERS_5 | EINVOICING
  name          text NOT NULL,
  price_monthly numeric(14,2) NOT NULL,
  adds          jsonb NOT NULL,                     -- {"max_terminals":1} | {"max_branches":1,"max_terminals":1}
  min_plan      text,                               -- plan mínimo requerido
  active        boolean NOT NULL DEFAULT true
);

INSERT INTO addons (code, name, price_monthly, adds, min_plan, active) VALUES
 ('EXTRA_TERMINAL', 'Caja adicional',         19900, '{"max_terminals":1}', 'NEGOCIO', true),
 ('EXTRA_BRANCH',   'Sucursal adicional',     49900, '{"max_branches":1,"max_terminals":1}', 'MULTITIENDA', true),
 ('EXTRA_USERS_5',  '5 usuarios adicionales',  9900, '{"max_users":5}', 'NEGOCIO', true),
 ('EINVOICING',     'Facturación electrónica', 29900, '{"features":{"einvoicing":true}}', 'TENDERO', false)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE subscription_addons (
  id              uuid PRIMARY KEY,
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  subscription_id uuid NOT NULL REFERENCES subscriptions(id),
  addon_code      text NOT NULL REFERENCES addons(code),
  quantity        int NOT NULL DEFAULT 1 CHECK (quantity > 0),
  starts_at       timestamptz NOT NULL DEFAULT now(),
  ends_at         timestamptz
);

ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_status_chk
    CHECK (status IN ('TRIAL','ACTIVE','PAST_DUE','RESTRICTED','SUSPENDED','CANCELLED')),
  ADD COLUMN IF NOT EXISTS billing_cycle text NOT NULL DEFAULT 'MONTHLY',  -- MONTHLY | YEARLY
  ADD COLUMN IF NOT EXISTS coupon_code   text,
  ADD COLUMN IF NOT EXISTS auto_charge   boolean NOT NULL DEFAULT false;

CREATE TABLE coupons (
  code          text PRIMARY KEY,                   -- FUNDADORES30
  percent_off   numeric(5,2),
  amount_off    numeric(14,2),
  months        int,                                -- duración del descuento
  max_redemptions int,
  redeemed      int NOT NULL DEFAULT 0,
  valid_until   date
);

-- Facturas de la suscripción (cobro de la plataforma al tenant).
CREATE TABLE billing_invoices (
  id              uuid PRIMARY KEY,
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  subscription_id uuid NOT NULL REFERENCES subscriptions(id),
  number          text UNIQUE NOT NULL,
  period_start    date NOT NULL,
  period_end      date NOT NULL,
  issued_at       timestamptz NOT NULL DEFAULT now(),
  due_date        date NOT NULL,
  subtotal        numeric(14,2) NOT NULL,
  discount        numeric(14,2) NOT NULL DEFAULT 0,
  tax             numeric(14,2) NOT NULL DEFAULT 0,
  total           numeric(14,2) NOT NULL,
  lines           jsonb NOT NULL,                   -- plan + add-ons + prorrateos
  status          text NOT NULL DEFAULT 'OPEN',     -- OPEN | PAID | VOID | UNCOLLECTIBLE
  payment_link    text,
  paid_at         timestamptz
);
CREATE INDEX ON billing_invoices (tenant_id, status, due_date);

CREATE TABLE billing_payments (
  id              uuid PRIMARY KEY,
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  invoice_id      uuid NOT NULL REFERENCES billing_invoices(id),
  method          text NOT NULL,                    -- CARD | PSE | NEQUI | DAVIPLATA | BRE_B | TRANSFER | CASH
  source          text NOT NULL,                    -- GATEWAY_WEBHOOK | MANUAL
  amount          numeric(14,2) NOT NULL,
  gateway_ref     text,
  receipt_s3_key  text,                             -- comprobante subido (pagos manuales)
  registered_by   uuid,                             -- super admin (pagos manuales)
  status          text NOT NULL,                    -- APPROVED | PENDING | DECLINED | REFUNDED
  received_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (gateway_ref)
);

-- Política de mora configurable por plan (días relativos a due_date).
CREATE TABLE dunning_policies (
  plan_code           text PRIMARY KEY REFERENCES plans(code),
  reminder_days_before int[] NOT NULL DEFAULT '{5}',
  notice_days_after   int[] NOT NULL DEFAULT '{1,3,5}',
  restrict_after_days int NOT NULL DEFAULT 7,
  suspend_after_days  int NOT NULL DEFAULT 15,
  cancel_after_days   int NOT NULL DEFAULT 60,
  data_retention_days int NOT NULL DEFAULT 90,
  send_from_hour      smallint NOT NULL DEFAULT 8,   -- avisos solo entre 8 a. m. y 7 p. m. (America/Bogota)
  send_to_hour        smallint NOT NULL DEFAULT 19
);
INSERT INTO dunning_policies (plan_code)
SELECT code FROM plans ON CONFLICT DO NOTHING;

CREATE TABLE dunning_notices (
  id           uuid PRIMARY KEY,
  tenant_id    uuid NOT NULL REFERENCES tenants(id),
  invoice_id   uuid NOT NULL REFERENCES billing_invoices(id),
  stage        text NOT NULL,                       -- REMINDER | NOTICE_1 | NOTICE_2 | FINAL | RESTRICTED | SUSPENDED | CANCELLED
  channels     text[] NOT NULL,                     -- EMAIL | WHATSAPP | PUSH | IN_APP
  sent_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invoice_id, stage)                        -- un aviso por etapa (idempotente)
);

CREATE TABLE grace_extensions (
  id           uuid PRIMARY KEY,
  tenant_id    uuid NOT NULL REFERENCES tenants(id),
  invoice_id   uuid REFERENCES billing_invoices(id),
  extra_days   int NOT NULL CHECK (extra_days BETWEEN 1 AND 30),
  reason       text NOT NULL,
  granted_by   uuid NOT NULL,                       -- super admin
  granted_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tenant_status_history (
  id           bigserial PRIMARY KEY,
  tenant_id    uuid NOT NULL REFERENCES tenants(id),
  from_status  text,
  to_status    text NOT NULL,
  reason       text NOT NULL,                       -- DUNNING | PAYMENT | MANUAL | TRIAL_END
  actor_id     uuid,
  changed_at   timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['subscription_addons','billing_invoices','billing_payments','dunning_notices',
                           'grace_extensions','tenant_status_history'] LOOP
    PERFORM app.enable_tenant_rls(t::regclass);
  END LOOP;
END $$;
-- Job diario "dunning-scheduler" (idempotente): evalúa facturas OPEN vs. dunning_policies + grace_extensions,
-- inserta dunning_notices y cambia tenants.status; publica tenant.status_changed y tenant.entitlements_changed.
-- La consola del super admin opera con el rol platform_admin (BYPASSRLS) y todo queda en audit_log.
