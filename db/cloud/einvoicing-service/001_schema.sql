-- einvoicing-service (FUTURO - NO DESPLEGADO EN LA FASE ACTUAL).
-- Se activa por tenant con fiscal_mode <> 'NONE' y feature "einvoicing".
-- Consumirá pos.events/sales.recorded y escribirá el resultado fiscal en su propia BD.

CREATE TABLE dian_resolutions (
  id                uuid PRIMARY KEY,
  tenant_id         uuid NOT NULL,
  doc_kind          text NOT NULL,                  -- POS_EQUIVALENT|INVOICE|CREDIT_NOTE|ADJUSTMENT_NOTE
  resolution_number text NOT NULL,
  prefix            text NOT NULL,
  range_from        bigint NOT NULL,
  range_to          bigint NOT NULL,
  valid_from        date NOT NULL,
  valid_to          date NOT NULL,
  technical_key_ref text,                           -- referencia a Secrets Manager
  status            text NOT NULL DEFAULT 'ACTIVE',
  created_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (range_to >= range_from)
);

CREATE TABLE terminal_numbering_blocks (
  id            uuid PRIMARY KEY,
  tenant_id     uuid NOT NULL,
  resolution_id uuid NOT NULL REFERENCES dian_resolutions(id),
  terminal_id   uuid NOT NULL,
  block_from    bigint NOT NULL,
  block_to      bigint NOT NULL,
  last_used     bigint,
  status        text NOT NULL DEFAULT 'ASSIGNED',   -- ASSIGNED|ACTIVE|EXHAUSTED|RELEASED
  assigned_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (block_to >= block_from),
  EXCLUDE USING gist (resolution_id WITH =, int8range(block_from, block_to, '[]') WITH &&)
);

CREATE TABLE electronic_documents (
  id              uuid PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  source_type     text NOT NULL,                    -- SALE|RETURN|SUPPORT_DOC
  source_id       uuid NOT NULL,
  doc_kind        text NOT NULL,
  prefix          text NOT NULL,
  number          bigint NOT NULL,
  cude            text NOT NULL,
  issued_at       timestamptz NOT NULL,
  contingency     boolean NOT NULL DEFAULT false,
  status          text NOT NULL DEFAULT 'PENDING',  -- PENDING|SENT|ACCEPTED|REJECTED|ERROR
  attempts        int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz,
  xml_s3_key      text,
  response_s3_key text,
  dian_messages   jsonb,
  provider_ref    text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, prefix, number),
  UNIQUE (tenant_id, source_type, source_id)
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['dian_resolutions','terminal_numbering_blocks','electronic_documents'] LOOP
    PERFORM app.enable_tenant_rls(t::regclass);
  END LOOP;
END $$;
