-- Edición Local (build `local`): tablas adicionales a 001_schema.sql.
-- En esta edición la base local es la fuente de verdad: no hay sync, outbox ni downstream.

ALTER TABLE device_state ADD COLUMN edition TEXT NOT NULL DEFAULT 'CLOUD'; -- CLOUD | LOCAL

CREATE TABLE local_license (
  id              INTEGER PRIMARY KEY CHECK (id = 1),
  license_id      TEXT,
  edition         TEXT,                             -- LOCAL_ESENCIAL | LOCAL_PLUS | TRIAL
  signed_payload  TEXT,                             -- licencia completa con firma Ed25519
  activated_at    INTEGER,
  trial_started_at INTEGER NOT NULL,
  machine_match   INTEGER                           -- componentes coincidentes en la última verificación
);

CREATE TABLE local_admin (
  id              INTEGER PRIMARY KEY CHECK (id = 1),
  business_name   TEXT NOT NULL,
  owner_doc       TEXT,
  address         TEXT,
  phone           TEXT,
  password_hash   TEXT NOT NULL,                    -- Argon2id
  recovery_hash   TEXT NOT NULL,                    -- hash del código de recuperación
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until    INTEGER,
  password_changed_at INTEGER NOT NULL
);

-- Usuarios locales (cajeros/supervisores); reemplaza la réplica de la nube.
ALTER TABLE users ADD COLUMN created_at INTEGER;
ALTER TABLE users ADD COLUMN disabled_at INTEGER;

CREATE TABLE stock_levels (
  product_id      TEXT PRIMARY KEY,
  on_hand_milli   INTEGER NOT NULL DEFAULT 0,
  avg_cost_cents  INTEGER,
  min_milli       INTEGER,
  max_milli       INTEGER,
  updated_at      INTEGER NOT NULL
);

CREATE TABLE suppliers (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT, doc TEXT, deleted INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE purchase_receipts (
  id TEXT PRIMARY KEY, supplier_id TEXT, reference TEXT, lines TEXT NOT NULL,
  total_cents INTEGER NOT NULL, received_by TEXT NOT NULL, received_at INTEGER NOT NULL
);

CREATE TABLE inventory_adjustments (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL, reason TEXT NOT NULL, lines TEXT NOT NULL,
  created_by TEXT NOT NULL, created_at INTEGER NOT NULL
);

CREATE TABLE customer_balances (
  customer_id TEXT PRIMARY KEY, balance_cents INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL
);

CREATE TABLE backups (
  id TEXT PRIMARY KEY, path TEXT NOT NULL,
  kind TEXT NOT NULL,                               -- AUTO_SHIFT | AUTO_DAILY | MANUAL | EXTERNAL | TRANSFER | PRE_RESTORE
  size_bytes INTEGER NOT NULL, sha256 TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  counts TEXT NOT NULL,                             -- JSON: productos, clientes, ventas, última venta
  verified_at INTEGER,                              -- releído y hash comparado tras escribir
  created_at INTEGER NOT NULL
);

CREATE TABLE restores (
  id TEXT PRIMARY KEY, backup_sha256 TEXT NOT NULL, backup_created_at INTEGER NOT NULL,
  backup_license_id TEXT NOT NULL, pre_restore_backup_id TEXT REFERENCES backups(id),
  restored_at INTEGER NOT NULL
);

-- Estado del equipo frente a un cambio de equipo.
CREATE TABLE device_transfer (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  state TEXT NOT NULL DEFAULT 'NORMAL',             -- NORMAL | PENDING_RELEASE | TRANSFERRED (solo lectura)
  transfer_backup_id TEXT REFERENCES backups(id),
  request_id TEXT,                                  -- id de local_transfer_requests en la nube
  updated_at INTEGER NOT NULL
);

CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
-- Claves: backup_folder, backup_last_external_at, discount_max_bp, receipt_footer, rounding_step, printer...
