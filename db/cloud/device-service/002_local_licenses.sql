-- device-service: licencias perpetuas de la Edición Local. Activación en línea una sola vez; luego offline.

CREATE TABLE local_licenses (
  id              text PRIMARY KEY,                 -- LOC-2026-000123
  serial_hash     bytea NOT NULL UNIQUE,            -- SHA-256 del serial entregado al cliente (nunca en claro)
  serial_last4    text NOT NULL,                    -- para identificarlo en soporte
  edition         text NOT NULL CHECK (edition IN ('LOCAL_ESENCIAL','LOCAL_PLUS')),
  customer_name   text NOT NULL,
  customer_doc    text NOT NULL,
  customer_phone  text,
  customer_email  citext,
  price_paid      numeric(14,2) NOT NULL,
  payment_ref     text,
  features        text[] NOT NULL,
  max_users       int NOT NULL,                     -- 0 = ilimitado
  updates_until   date NOT NULL,
  transfers_used  int NOT NULL DEFAULT 0,
  status          text NOT NULL DEFAULT 'ISSUED',   -- ISSUED | ACTIVE | REVOKED | MIGRATED_TO_CLOUD
  sold_by         uuid NOT NULL,                    -- super admin
  created_at      timestamptz NOT NULL DEFAULT now(),
  notes           text
);

-- Cada activación en línea = una licencia firmada para un equipo concreto.
CREATE TABLE local_license_activations (
  id              uuid PRIMARY KEY,
  license_id      text NOT NULL REFERENCES local_licenses(id),
  machine_hashes  jsonb NOT NULL,                   -- {"cpu":"..","board":"..","disk":"..","os_guid":"..","mac":".."}
  device_pubkey   text NOT NULL,                    -- llave pública Ed25519 del equipo (privada en TPM/DPAPI)
  key_kid         text NOT NULL,                    -- llave KMS usada para firmar
  signed_payload  text NOT NULL,
  client_ip       inet,
  client_geo      text,                             -- ciudad aproximada por IP
  app_version     text,
  status          text NOT NULL DEFAULT 'ACTIVE',   -- ACTIVE | DEACTIVATED | RELEASED_BY_SUPPORT | REVOKED
  issued_at       timestamptz NOT NULL DEFAULT now(),
  ended_at        timestamptz,
  ended_by        uuid                              -- super admin si fue liberada por soporte
);
CREATE UNIQUE INDEX one_active_activation ON local_license_activations (license_id) WHERE status = 'ACTIVE';

-- Intentos de activación (rate limit, detección de seriales compartidos).
CREATE TABLE local_activation_attempts (
  id              bigserial PRIMARY KEY,
  license_id      text,
  serial_last4    text,
  machine_hashes  jsonb,
  client_ip       inet NOT NULL,
  result          text NOT NULL,                    -- OK | REACTIVATED_SAME_MACHINE | ALREADY_ACTIVATED | INVALID_SERIAL | REVOKED | RATE_LIMITED
  attempted_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON local_activation_attempts (license_id, attempted_at DESC);
CREATE INDEX ON local_activation_attempts (client_ip, attempted_at DESC);

-- Pruebas de 15 días: una por equipo.
CREATE TABLE local_trials (
  id              uuid PRIMARY KEY,
  machine_hashes  jsonb NOT NULL,
  machine_key     text NOT NULL UNIQUE,             -- hash combinado de os_guid + board (identidad estable)
  device_pubkey   text NOT NULL,
  started_at      timestamptz NOT NULL DEFAULT now(),
  ends_at         timestamptz NOT NULL,
  client_ip       inet
);

-- Renovaciones de actualizaciones: amplían updates_until; el equipo descarga la licencia nueva con "Actualizar licencia" (en línea).
CREATE TABLE local_license_renewals (
  id              uuid PRIMARY KEY,
  license_id      text NOT NULL REFERENCES local_licenses(id),
  previous_until  date NOT NULL,
  new_until       date NOT NULL,
  price_paid      numeric(14,2) NOT NULL,
  registered_by   uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Solicitudes de restablecimiento de contraseña de administrador (en línea, aprobadas por el super admin, uso único).
CREATE TABLE local_admin_resets (
  id              uuid PRIMARY KEY,
  license_id      text NOT NULL REFERENCES local_licenses(id),
  activation_id   uuid NOT NULL REFERENCES local_license_activations(id),
  request_sig     text NOT NULL,                    -- solicitud firmada con la llave del equipo
  status          text NOT NULL DEFAULT 'PENDING',  -- PENDING | APPROVED | REJECTED | CONSUMED | EXPIRED
  identity_check  text,                             -- cómo se verificó al comprador
  decided_by      uuid,
  requested_at    timestamptz NOT NULL DEFAULT now(),
  decided_at      timestamptz,
  expires_at      timestamptz NOT NULL
);

-- Solicitudes de cambio de equipo: solo metadatos del respaldo (los datos nunca salen del cliente).
CREATE TABLE local_transfer_requests (
  id                 uuid PRIMARY KEY,
  license_id         text NOT NULL REFERENCES local_licenses(id),
  from_activation_id uuid NOT NULL REFERENCES local_license_activations(id),
  to_activation_id   uuid REFERENCES local_license_activations(id),
  backup_sha256      text NOT NULL,
  backup_created_at  timestamptz NOT NULL,
  backup_counts      jsonb NOT NULL,                -- {"products":..,"customers":..,"sales":..,"last_sale_at":".."}
  source             text NOT NULL,                 -- APP_WIZARD | SUPPORT_CONSOLE (PC dañado)
  status             text NOT NULL DEFAULT 'LICENSE_RELEASED', -- LICENSE_RELEASED | COMPLETED | CANCELLED
  requested_at       timestamptz NOT NULL DEFAULT now(),
  completed_at       timestamptz,
  handled_by         uuid                            -- super admin si fue por consola
);
CREATE INDEX ON local_transfer_requests (license_id, requested_at DESC);

-- Restauraciones en una licencia distinta a la del respaldo (requieren aprobación).
CREATE TABLE local_restore_approvals (
  id                 uuid PRIMARY KEY,
  backup_license_id  text NOT NULL REFERENCES local_licenses(id),
  target_license_id  text NOT NULL REFERENCES local_licenses(id),
  backup_sha256      text NOT NULL,
  reason             text NOT NULL,
  approved_by        uuid NOT NULL,
  approved_at        timestamptz NOT NULL DEFAULT now()
);
-- Solo accesible por el rol platform_admin; toda operación se registra en audit_log.
