-- sync-service: ingesta de eventos de terminales (subida) y modelo de bajada por terminal.

-- Event store de ingesta: fuente de verdad de lo que enviaron las cajas (append-only).
CREATE TABLE ingested_events (
  event_id       uuid NOT NULL,
  tenant_id      uuid NOT NULL,
  branch_id      uuid NOT NULL,
  terminal_id    uuid NOT NULL,
  terminal_seq   bigint NOT NULL,
  event_type     text NOT NULL,
  schema_version int NOT NULL,
  occurred_at    timestamptz NOT NULL,
  received_at    timestamptz NOT NULL DEFAULT now(),
  payload        jsonb NOT NULL,
  payload_hash   bytea NOT NULL,
  PRIMARY KEY (event_id, received_at),
  UNIQUE (terminal_id, terminal_seq, received_at)
) PARTITION BY RANGE (received_at);

-- Índice global de idempotencia (no particionado).
CREATE TABLE event_ids (
  event_id     uuid PRIMARY KEY,
  tenant_id    uuid NOT NULL,
  terminal_id  uuid NOT NULL,
  terminal_seq bigint NOT NULL,
  payload_hash bytea NOT NULL,
  UNIQUE (terminal_id, terminal_seq)
);

CREATE TABLE terminal_seq_state (
  terminal_id  uuid PRIMARY KEY,
  tenant_id    uuid NOT NULL,
  last_seq     bigint NOT NULL DEFAULT 0
);

CREATE TABLE sync_quarantine (
  event_id     uuid PRIMARY KEY,
  tenant_id    uuid NOT NULL,
  terminal_id  uuid NOT NULL,
  source       text NOT NULL,                       -- servicio consumidor que no pudo aplicarlo
  error_code   text NOT NULL,
  error_detail text,
  status       text NOT NULL DEFAULT 'OPEN',        -- OPEN|RESOLVED|DISCARDED
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Modelo de bajada: réplica desnormalizada alimentada por eventos de catalog/identity/customer/inventory.
CREATE TABLE downstream_changes (
  tenant_id    uuid NOT NULL,
  branch_id    uuid,                                -- NULL = aplica a todas las sucursales
  stream       text NOT NULL,                       -- catalog|prices|promotions|taxes|users|customers|stock_snapshot|config
  entity       text NOT NULL,
  entity_id    uuid NOT NULL,
  op           text NOT NULL,                       -- upsert|delete
  data         jsonb,
  source_version bigint NOT NULL,                   -- descarta eventos viejos que lleguen tarde
  updated_at   timestamptz NOT NULL DEFAULT now(),
  row_xid      xid8 NOT NULL DEFAULT pg_current_xact_id(),
  PRIMARY KEY (tenant_id, entity, entity_id, branch_id)
);
CREATE INDEX downstream_pull_idx ON downstream_changes (tenant_id, stream, row_xid);

CREATE TRIGGER trg_touch BEFORE INSERT OR UPDATE ON downstream_changes FOR EACH ROW EXECUTE FUNCTION app.touch_row();
SELECT app.enable_tenant_rls('event_ids');
SELECT app.enable_tenant_rls('terminal_seq_state');
SELECT app.enable_tenant_rls('sync_quarantine');
SELECT app.enable_tenant_rls('downstream_changes');
-- ingested_events: particiones mensuales con pg_partman; retención 24 meses + archivo S3.
-- Publica a Kafka topic pos.events (key = terminal_id) vía outbox.
