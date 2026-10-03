-- device-service: terminales, enrolamiento, licencias, heartbeat.

CREATE TABLE terminals (
  id                 uuid PRIMARY KEY,
  tenant_id          uuid NOT NULL,
  branch_id          uuid NOT NULL,
  code               text NOT NULL,                 -- C01 (también prefijo del consecutivo interno)
  name               text NOT NULL,
  status             text NOT NULL DEFAULT 'PENDING_ENROLL', -- PENDING_ENROLL|ACTIVE|REVOKED|RETIRED
  device_public_key  text,
  device_fingerprint text,
  app_version        text,
  last_heartbeat_at  timestamptz,
  last_push_at       timestamptz,
  pending_outbox_reported int,
  oldest_pending_at  timestamptz,
  last_receipt_number bigint,                       -- último consecutivo interno reportado
  enrolled_at        timestamptz,
  revoked_at         timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE TABLE terminal_enrollment_codes (
  code_hash   text PRIMARY KEY,
  tenant_id   uuid NOT NULL,
  terminal_id uuid NOT NULL REFERENCES terminals(id),
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz
);

CREATE TABLE licenses_issued (
  id          uuid PRIMARY KEY,
  tenant_id   uuid NOT NULL,
  terminal_id uuid NOT NULL REFERENCES terminals(id),
  kid         text NOT NULL,                        -- id de la llave KMS que firmó
  status      text NOT NULL,
  expires_at  timestamptz NOT NULL,
  issued_at   timestamptz NOT NULL DEFAULT now()
);

-- Réplica local (por eventos de tenant-service) para validar límites sin llamada síncrona.
CREATE TABLE tenant_limits_replica (
  tenant_id     uuid PRIMARY KEY,
  status        text NOT NULL,
  plan_code     text NOT NULL,
  max_terminals int,
  features      jsonb NOT NULL,
  grace_days    int NOT NULL,
  updated_at    timestamptz NOT NULL
);

SELECT app.enable_tenant_rls('terminals');
SELECT app.enable_tenant_rls('licenses_issued');
-- Eventos: terminal.enrolled, terminal.revoked, terminal.heartbeat (muestreado), terminal.stale
