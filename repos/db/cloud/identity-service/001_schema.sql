-- identity-service: usuarios, roles, permisos, PIN, membresías.

CREATE TABLE users (
  id               uuid PRIMARY KEY,
  tenant_id        uuid,                            -- NULL = super admin plataforma
  idp_subject      text UNIQUE,
  email            citext,
  full_name        text NOT NULL,
  doc_type         text,
  doc_number       text,
  pin_hash         text,                            -- Argon2id
  pin_updated_at   timestamptz,
  status           text NOT NULL DEFAULT 'ACTIVE',  -- ACTIVE|LOCKED|DISABLED
  mfa_enabled      boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  row_xid          xid8 NOT NULL DEFAULT pg_current_xact_id(),
  UNIQUE (tenant_id, email)
);

CREATE TABLE roles (
  id          uuid PRIMARY KEY,
  tenant_id   uuid,                                 -- NULL = rol de sistema
  code        text NOT NULL,
  name        text NOT NULL,
  UNIQUE NULLS NOT DISTINCT (tenant_id, code)        -- roles de sistema tienen tenant_id NULL
);

CREATE TABLE permissions (
  code        text PRIMARY KEY,
  description text NOT NULL
);

CREATE TABLE role_permissions (
  role_id     uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission  text NOT NULL REFERENCES permissions(code),
  PRIMARY KEY (role_id, permission)
);

CREATE TABLE user_memberships (
  id          uuid PRIMARY KEY,
  tenant_id   uuid NOT NULL,
  user_id     uuid NOT NULL REFERENCES users(id),
  role_id     uuid NOT NULL REFERENCES roles(id),
  branch_id   uuid,                                 -- NULL = todas las sucursales
  updated_at  timestamptz NOT NULL DEFAULT now(),
  row_xid     xid8 NOT NULL DEFAULT pg_current_xact_id(),
  deleted_at  timestamptz
);
CREATE INDEX ON user_memberships (tenant_id, user_id);

CREATE TRIGGER trg_touch BEFORE INSERT OR UPDATE ON users FOR EACH ROW EXECUTE FUNCTION app.touch_row();
CREATE TRIGGER trg_touch BEFORE INSERT OR UPDATE ON user_memberships FOR EACH ROW EXECUTE FUNCTION app.touch_row();
SELECT app.enable_tenant_rls('user_memberships');
-- users no usa RLS estándar (incluye super admins); el servicio filtra por tenant y se cubre con pruebas.
-- Eventos: user.created/updated/disabled, user.pin_changed (solo hash), membership.changed, role.changed
