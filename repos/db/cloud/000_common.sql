-- =====================================================================
-- TienditaOnline - Elementos comunes (se aplican en la BD de CADA microservicio)
-- Patrón: database-per-service. Sin FKs entre servicios; solo IDs (UUIDv7).
-- Dinero NUMERIC(14,2) COP; cantidades NUMERIC(14,3).
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE SCHEMA IF NOT EXISTS app;

CREATE OR REPLACE FUNCTION app.current_tenant() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.tenant_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION app.touch_row() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  NEW.row_xid    := pg_current_xact_id();
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION app.enable_tenant_rls(tbl regclass) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', tbl);
  EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', tbl);
  EXECUTE format(
    'CREATE POLICY tenant_isolation ON %s USING (tenant_id = app.current_tenant()) WITH CHECK (tenant_id = app.current_tenant())',
    tbl);
END $$;

-- Transactional outbox: cambios de estado + evento publicado en la misma transacción.
CREATE TABLE IF NOT EXISTS outbox (
  id            bigserial PRIMARY KEY,
  event_id      uuid NOT NULL UNIQUE,
  tenant_id     uuid NOT NULL,
  topic         text NOT NULL,
  partition_key text NOT NULL,
  event_type    text NOT NULL,
  payload       jsonb NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  published_at  timestamptz
);
CREATE INDEX IF NOT EXISTS outbox_unpublished ON outbox (id) WHERE published_at IS NULL;

-- Idempotent consumer: cada mensaje consumido se registra en la misma transacción que su efecto.
CREATE TABLE IF NOT EXISTS inbox (
  event_id      uuid NOT NULL,
  consumer      text NOT NULL,
  processed_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, consumer)
);

-- Roles por servicio (credenciales distintas en Secrets Manager):
-- CREATE ROLE <svc>_rw LOGIN NOBYPASSRLS;  -- la app nunca es dueña de las tablas
