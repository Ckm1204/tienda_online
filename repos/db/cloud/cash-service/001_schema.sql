-- cash-service: turnos, movimientos de efectivo, arqueos.

CREATE TABLE cash_sessions (
  id               uuid PRIMARY KEY,
  tenant_id        uuid NOT NULL,
  branch_id        uuid NOT NULL,
  terminal_id      uuid NOT NULL,
  opened_by        uuid NOT NULL,
  opened_at        timestamptz NOT NULL,
  opening_float    numeric(14,2) NOT NULL,
  closed_by        uuid,
  closed_at        timestamptz,
  expected_cash    numeric(14,2),                   -- calculado por la terminal
  server_expected_cash numeric(14,2),               -- recalculado en nube (control)
  declared_cash    numeric(14,2),
  difference       numeric(14,2),
  declared_detail  jsonb,
  status           text NOT NULL DEFAULT 'OPEN',    -- OPEN|CLOSED|FORCE_CLOSED|REOPENED
  received_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON cash_sessions (tenant_id, terminal_id, opened_at DESC);

CREATE TABLE cash_movements (
  id               uuid PRIMARY KEY,
  tenant_id        uuid NOT NULL,
  cash_session_id  uuid NOT NULL REFERENCES cash_sessions(id),
  kind             text NOT NULL,                   -- SALE_CASH|CHANGE|REFUND|CASH_IN|CASH_OUT|EXPENSE|SUPPLIER_PAYMENT|SAFE_DROP|CREDIT_PAYMENT
  amount           numeric(14,2) NOT NULL,          -- con signo
  reason           text,
  source_id        uuid,
  approved_by      uuid,
  occurred_at      timestamptz NOT NULL,
  created_by       uuid NOT NULL
);
CREATE INDEX ON cash_movements (tenant_id, cash_session_id);

SELECT app.enable_tenant_rls('cash_sessions');
SELECT app.enable_tenant_rls('cash_movements');
-- Consume: pos.events (cash.*, sale.completed -> pagos en efectivo, sale.returned, credit.payment.received)
-- Publica: cash.session.closed, cash.discrepancy.detected
