-- notification-service: plantillas, envíos (email, SMS, WhatsApp, push), preferencias y dispositivos push.

CREATE TABLE notification_templates (
  code          text NOT NULL,                      -- dunning.notice_1, cash.discrepancy, stock.negative...
  channel       text NOT NULL,                      -- EMAIL | SMS | WHATSAPP | PUSH | IN_APP
  locale        text NOT NULL DEFAULT 'es-CO',
  subject       text,
  body          text NOT NULL,                      -- con variables {{tenant_name}}, {{amount}}...
  provider_template_id text,                        -- id de plantilla aprobada por Meta (WhatsApp)
  version       int NOT NULL DEFAULT 1,
  active        boolean NOT NULL DEFAULT true,
  PRIMARY KEY (code, channel, locale)
);

CREATE TABLE push_devices (
  id            uuid PRIMARY KEY,
  tenant_id     uuid NOT NULL,
  user_id       uuid NOT NULL,
  platform      text NOT NULL,                      -- IOS | ANDROID | WEB
  token         text NOT NULL UNIQUE,
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  revoked_at    timestamptz
);

CREATE TABLE notification_preferences (
  tenant_id     uuid NOT NULL,
  user_id       uuid NOT NULL,
  topic         text NOT NULL,                      -- cash.discrepancy | stock.negative | billing | terminal.stale ...
  channels      text[] NOT NULL,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id, topic)
);

CREATE TABLE notifications (
  id            uuid PRIMARY KEY,
  tenant_id     uuid,                               -- NULL = mensaje de plataforma
  user_id       uuid,
  recipient     text NOT NULL,                      -- email / teléfono E.164 / token
  channel       text NOT NULL,
  template_code text NOT NULL,
  payload       jsonb NOT NULL,
  dedupe_key    text NOT NULL UNIQUE,               -- evita duplicados (p. ej. invoice_id + etapa)
  status        text NOT NULL DEFAULT 'QUEUED',     -- QUEUED | SENT | DELIVERED | READ | FAILED
  provider      text,
  provider_ref  text,
  error         text,
  scheduled_for timestamptz NOT NULL DEFAULT now(), -- respeta horario permitido
  sent_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON notifications (status, scheduled_for) WHERE status = 'QUEUED';
CREATE INDEX ON notifications (tenant_id, created_at DESC);

SELECT app.enable_tenant_rls('push_devices');
SELECT app.enable_tenant_rls('notification_preferences');
-- notifications: la acceden el worker (rol de servicio) y la consola; no se expone por tenant.
-- Proveedores sugeridos: email (Amazon SES), SMS (proveedor local o Twilio), WhatsApp Business API
-- (Meta Cloud API o BSP como 360dialog/Twilio, con plantillas aprobadas), push (Expo Push / FCM / APNs).
