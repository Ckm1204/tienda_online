-- =====================================================================
-- TienditaOnline - Esquema local de la terminal POS (SQLite + SQLCipher)
-- PRAGMA key se aplica al abrir (clave derivada del keystore del SO).
-- PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON;
-- IDs: UUIDv7 en TEXT. Dinero: INTEGER en centavos (evita errores de coma flotante).
-- =====================================================================

-- ------------------------- Estado del dispositivo --------------------
CREATE TABLE device_state (
  id                    INTEGER PRIMARY KEY CHECK (id = 1),
  tenant_id             TEXT NOT NULL,
  branch_id             TEXT NOT NULL,
  terminal_id           TEXT NOT NULL,
  warehouse_id          TEXT NOT NULL,
  device_key_ref        TEXT NOT NULL,             -- alias en keystore del SO (DPAPI/Keychain/Keystore)
  license_token         TEXT,                      -- JWT Ed25519 firmado por la nube
  license_expires_at    INTEGER,                   -- epoch ms (fin de gracia)
  last_server_time      INTEGER,                   -- última hora confiable recibida de la nube
  max_seen_local_time   INTEGER NOT NULL DEFAULT 0,-- anti-retroceso de reloj
  next_terminal_seq     INTEGER NOT NULL DEFAULT 1,
  receipt_prefix        TEXT NOT NULL,             -- código de la caja (C01)
  next_receipt_number   INTEGER NOT NULL DEFAULT 1,-- consecutivo interno; nunca se reinicia
  fiscal_mode           TEXT NOT NULL DEFAULT 'NONE', -- NONE | DIAN_POS | DIAN_INVOICE (futuro)
  features              TEXT NOT NULL DEFAULT '{}',   -- JSON de features del plan
  schema_version        INTEGER NOT NULL
);

CREATE TABLE sync_cursors (
  stream                TEXT PRIMARY KEY,          -- catalog|users|customers|config|numbering
  cursor                TEXT,                      -- xid opaco devuelto por la nube
  last_success_at       INTEGER
);

-- ------------------------- Réplica de catálogo -----------------------
CREATE TABLE users (
  id TEXT PRIMARY KEY, full_name TEXT NOT NULL, pin_hash TEXT, status TEXT NOT NULL,
  role_codes TEXT NOT NULL,                        -- JSON
  permissions TEXT NOT NULL,                       -- JSON
  failed_pin_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER
);

CREATE TABLE taxes (
  id TEXT PRIMARY KEY, code TEXT NOT NULL, dian_code TEXT NOT NULL, kind TEXT NOT NULL,
  rate_bp INTEGER NOT NULL,                        -- puntos básicos: 19% = 1900
  deleted INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE categories (id TEXT PRIMARY KEY, parent_id TEXT, name TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0);

CREATE TABLE products (
  id TEXT PRIMARY KEY, sku TEXT NOT NULL, name TEXT NOT NULL, category_id TEXT,
  unit TEXT NOT NULL, is_weighted INTEGER NOT NULL, track_stock INTEGER NOT NULL,
  allow_negative_stock INTEGER NOT NULL, tax_ids TEXT NOT NULL,
  price_cents INTEGER NOT NULL,                    -- precio vigente para ESTA sucursal
  status TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_products_name ON products(name);

CREATE TABLE product_barcodes (
  barcode TEXT PRIMARY KEY, product_id TEXT NOT NULL, pack_qty_milli INTEGER NOT NULL DEFAULT 1000,
  deleted INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE promotions (id TEXT PRIMARY KEY, kind TEXT NOT NULL, rules TEXT NOT NULL,
  starts_at INTEGER NOT NULL, ends_at INTEGER NOT NULL, priority INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0);

CREATE TABLE customers (
  id TEXT PRIMARY KEY, doc_type TEXT, doc_number TEXT, dv INTEGER,
  full_name TEXT NOT NULL, alias TEXT, email TEXT, phone TEXT, credit_mode TEXT NOT NULL DEFAULT 'SOFT',
  credit_enabled INTEGER NOT NULL, credit_limit_cents INTEGER NOT NULL,
  server_balance_cents INTEGER NOT NULL DEFAULT 0, -- saldo consolidado según la nube
  deleted INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX idx_customers_doc ON customers(doc_type, doc_number) WHERE doc_number IS NOT NULL;
CREATE INDEX idx_customers_name ON customers(full_name);

-- Saldo local estimado = server_balance + cargos/abonos locales aún no confirmados
CREATE TABLE local_credit_movements (
  id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, amount_cents INTEGER NOT NULL,
  sale_id TEXT, occurred_at INTEGER NOT NULL, synced INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE stock_snapshot (                      -- existencia de referencia enviada por la nube
  product_id TEXT PRIMARY KEY, on_hand_milli INTEGER NOT NULL, as_of INTEGER NOT NULL
);

CREATE TABLE local_stock_movements (
  id TEXT PRIMARY KEY, product_id TEXT NOT NULL, qty_milli INTEGER NOT NULL, kind TEXT NOT NULL,
  reason TEXT, source_id TEXT, occurred_at INTEGER NOT NULL, synced INTEGER NOT NULL DEFAULT 0
);

-- ------------------------- Numeración DIAN (FUTURO) ------------------
-- Solo se usa cuando fiscal_mode <> 'NONE'. Se crea desde ya para no requerir migración disruptiva.
CREATE TABLE numbering_blocks (
  id TEXT PRIMARY KEY, resolution_id TEXT NOT NULL, doc_kind TEXT NOT NULL,
  resolution_number TEXT NOT NULL, prefix TEXT NOT NULL,
  block_from INTEGER NOT NULL, block_to INTEGER NOT NULL,
  next_number INTEGER NOT NULL,
  valid_to INTEGER NOT NULL,
  status TEXT NOT NULL                             -- ACTIVE|STANDBY|EXHAUSTED
);

-- ------------------------- Operación ---------------------------------
CREATE TABLE cash_sessions (
  id TEXT PRIMARY KEY, opened_by TEXT NOT NULL, opened_at INTEGER NOT NULL,
  opening_float_cents INTEGER NOT NULL,
  closed_by TEXT, closed_at INTEGER,
  expected_cash_cents INTEGER, declared_cash_cents INTEGER, difference_cents INTEGER,
  declared_detail TEXT, status TEXT NOT NULL
);
CREATE UNIQUE INDEX one_open_session ON cash_sessions(status) WHERE status = 'OPEN';

CREATE TABLE cash_movements (
  id TEXT PRIMARY KEY, cash_session_id TEXT NOT NULL REFERENCES cash_sessions(id),
  kind TEXT NOT NULL, amount_cents INTEGER NOT NULL, reason TEXT NOT NULL,
  approved_by TEXT, created_by TEXT NOT NULL, occurred_at INTEGER NOT NULL
);

CREATE TABLE sales (
  id TEXT PRIMARY KEY, cash_session_id TEXT NOT NULL REFERENCES cash_sessions(id),
  cashier_id TEXT NOT NULL, customer_id TEXT,
  receipt_prefix TEXT NOT NULL, receipt_number INTEGER NOT NULL,
  fiscal_doc_kind TEXT, fiscal_prefix TEXT, fiscal_number INTEGER, cude TEXT, -- NULL con fiscal_mode = NONE
  status TEXT NOT NULL, subtotal_cents INTEGER NOT NULL, discount_cents INTEGER NOT NULL,
  tax_cents INTEGER NOT NULL, total_cents INTEGER NOT NULL, rounding_cents INTEGER NOT NULL,
  is_credit INTEGER NOT NULL, issued_at INTEGER NOT NULL,
  UNIQUE (receipt_prefix, receipt_number)
);
CREATE INDEX idx_sales_issued ON sales(issued_at);

CREATE TABLE sale_lines (
  id TEXT PRIMARY KEY, sale_id TEXT NOT NULL REFERENCES sales(id), line_no INTEGER NOT NULL,
  product_id TEXT NOT NULL, description TEXT NOT NULL, qty_milli INTEGER NOT NULL,
  unit_price_cents INTEGER NOT NULL, discount_cents INTEGER NOT NULL,
  tax_detail TEXT NOT NULL, line_total_cents INTEGER NOT NULL
);

CREATE TABLE sale_payments (
  id TEXT PRIMARY KEY, sale_id TEXT NOT NULL REFERENCES sales(id), method TEXT NOT NULL,
  amount_cents INTEGER NOT NULL, tendered_cents INTEGER, change_cents INTEGER, reference TEXT
);

CREATE TABLE sale_returns (
  id TEXT PRIMARY KEY, original_sale_id TEXT NOT NULL, kind TEXT NOT NULL, reason TEXT NOT NULL,
  approved_by TEXT NOT NULL, lines TEXT NOT NULL, refund_cents INTEGER NOT NULL,
  refund_method TEXT NOT NULL, cash_session_id TEXT NOT NULL, occurred_at INTEGER NOT NULL
);

-- Carritos suspendidos / en espera (no generan evento hasta cobrar).
CREATE TABLE parked_carts (id TEXT PRIMARY KEY, cashier_id TEXT NOT NULL, data TEXT NOT NULL, created_at INTEGER NOT NULL);

-- Auditoría local (se sincroniza como eventos audit.*).
CREATE TABLE local_audit (
  id TEXT PRIMARY KEY, actor_id TEXT, action TEXT NOT NULL, entity_id TEXT,
  data TEXT, occurred_at INTEGER NOT NULL, prev_hash BLOB, hash BLOB NOT NULL
);

-- ------------------------- Outbox ------------------------------------
CREATE TABLE outbox (
  event_id      TEXT PRIMARY KEY,                  -- UUIDv7
  terminal_seq  INTEGER NOT NULL UNIQUE,           -- monotónico sin huecos
  event_type    TEXT NOT NULL,                     -- sale.completed, cash.session.opened...
  schema_version INTEGER NOT NULL,
  payload       TEXT NOT NULL,                     -- JSON canónico
  payload_hash  TEXT NOT NULL,                     -- SHA-256 hex
  occurred_at   INTEGER NOT NULL,
  hlc           TEXT NOT NULL,                     -- Hybrid Logical Clock
  status        TEXT NOT NULL DEFAULT 'PENDING',   -- PENDING|IN_FLIGHT|SENT|REJECTED
  attempts      INTEGER NOT NULL DEFAULT 0,
  last_error    TEXT,
  sent_at       INTEGER
);
CREATE INDEX idx_outbox_pending ON outbox(status, terminal_seq);

-- Purga: eventos SENT con más de 30 días y respaldados se eliminan; REJECTED nunca se purgan automáticamente.
