-- tenant-service: planes, tenants, suscripciones, sucursales, configuración fiscal.

CREATE TABLE plans (
  id                 uuid PRIMARY KEY,
  code               text UNIQUE NOT NULL,          -- ESENCIAL | CRECIMIENTO | CORPORATIVO
  name               text NOT NULL,
  max_branches       int,                           -- NULL = ilimitado
  max_terminals      int,
  max_users          int,
  features           jsonb NOT NULL DEFAULT '{}',   -- {"credit":true,"transfers":false,"einvoicing":false}
  price_monthly      numeric(14,2) NOT NULL,
  offline_grace_days int NOT NULL DEFAULT 10,
  active             boolean NOT NULL DEFAULT true
);

CREATE TABLE tenants (
  id               uuid PRIMARY KEY,
  legal_name       text NOT NULL,
  trade_name       text,
  owner_doc_type   text NOT NULL,                   -- CC | NIT | CE | PPT
  owner_doc_number text NOT NULL,
  nit_dv           smallint,
  tax_regime       text NOT NULL DEFAULT 'NO_RESPONSABLE_IVA',
  -- NONE = solo comprobante interno (tiendas de barrio). DIAN_* se habilita con el módulo futuro.
  fiscal_mode      text NOT NULL DEFAULT 'NONE' CHECK (fiscal_mode IN ('NONE','DIAN_POS','DIAN_INVOICE')),
  not_obligated_declared_at timestamptz,            -- declaración del tenant de no estar obligado a facturar
  city_dane_code   text,
  address          text,
  email            citext NOT NULL,
  phone            text,
  status           text NOT NULL DEFAULT 'TRIAL',   -- TRIAL|ACTIVE|PAST_DUE|RESTRICTED|SUSPENDED|CANCELLED
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_doc_type, owner_doc_number)
);

CREATE TABLE subscriptions (
  id                   uuid PRIMARY KEY,
  tenant_id            uuid NOT NULL REFERENCES tenants(id),
  plan_id              uuid NOT NULL REFERENCES plans(id),
  status               text NOT NULL,               -- TRIAL|ACTIVE|PAST_DUE|RESTRICTED|SUSPENDED|CANCELLED (igual que tenants)
  current_period_start timestamptz NOT NULL,
  current_period_end   timestamptz NOT NULL,
  cancel_at            timestamptz,
  gateway              text,                        -- WOMPI|PAYU|MERCADOPAGO
  gateway_ref          text,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON subscriptions (tenant_id, status);

CREATE TABLE tenant_feature_overrides (
  tenant_id   uuid NOT NULL REFERENCES tenants(id),
  feature     text NOT NULL,
  enabled     boolean NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, feature)
);

CREATE TABLE branches (
  id               uuid PRIMARY KEY,
  tenant_id        uuid NOT NULL REFERENCES tenants(id),
  code             text NOT NULL,
  name             text NOT NULL,
  address          text,
  city_dane_code   text,
  timezone         text NOT NULL DEFAULT 'America/Bogota',
  receipt_header   text,
  receipt_footer   text,
  status           text NOT NULL DEFAULT 'ACTIVE',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

SELECT app.enable_tenant_rls('subscriptions');
SELECT app.enable_tenant_rls('tenant_feature_overrides');
SELECT app.enable_tenant_rls('branches');
-- Eventos publicados: tenant.created, tenant.status_changed, subscription.changed, plan.limits_changed,
-- branch.created/updated, tenant.features_changed
