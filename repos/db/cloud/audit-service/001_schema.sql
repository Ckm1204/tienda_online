-- audit-service: bitácora inmutable con cadena de hash por tenant.

CREATE TABLE audit_log (
  id           uuid NOT NULL,
  tenant_id    uuid,
  actor_id     uuid,
  actor_kind   text NOT NULL,                       -- USER|TERMINAL|SYSTEM|SUPPORT
  terminal_id  uuid,
  action       text NOT NULL,                       -- sale.void, drawer.open.manual, receipt.reprint, cart.item.remove...
  entity_type  text,
  entity_id    uuid,
  data         jsonb,
  ip           inet,
  occurred_at  timestamptz NOT NULL,
  prev_hash    bytea,
  hash         bytea NOT NULL,
  PRIMARY KEY (id, occurred_at)
) PARTITION BY RANGE (occurred_at);
CREATE INDEX ON audit_log (tenant_id, occurred_at DESC);
CREATE INDEX ON audit_log (tenant_id, action, occurred_at DESC);

SELECT app.enable_tenant_rls('audit_log');
-- GRANT INSERT, SELECT ON audit_log TO audit_rw;  (sin UPDATE/DELETE)
-- Consume: pos.events (audit.recorded, sale.voided, sale.returned, cash.session.reopened...) y *.admin_action
