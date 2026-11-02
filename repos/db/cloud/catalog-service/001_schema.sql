-- catalog-service: impuestos, categorías, marcas, productos, códigos, precios, promociones.

CREATE TABLE taxes (
  id          uuid PRIMARY KEY,
  tenant_id   uuid NOT NULL,
  code        text NOT NULL,                        -- IVA19|IVA5|EXENTO|EXCLUIDO|INC8|BOLSA
  dian_code   text,                                 -- mapeado para facturación electrónica futura
  kind        text NOT NULL,                        -- PERCENT|FIXED_PER_UNIT
  rate        numeric(9,4) NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  row_xid     xid8 NOT NULL DEFAULT pg_current_xact_id(),
  deleted_at  timestamptz,
  UNIQUE (tenant_id, code)
);

CREATE TABLE categories (
  id          uuid PRIMARY KEY,
  tenant_id   uuid NOT NULL,
  parent_id   uuid REFERENCES categories(id),
  name        text NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  row_xid     xid8 NOT NULL DEFAULT pg_current_xact_id(),
  deleted_at  timestamptz
);

CREATE TABLE brands (
  id          uuid PRIMARY KEY,
  tenant_id   uuid NOT NULL,
  name        text NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  row_xid     xid8 NOT NULL DEFAULT pg_current_xact_id(),
  deleted_at  timestamptz
);

CREATE TABLE products (
  id                   uuid PRIMARY KEY,
  tenant_id            uuid NOT NULL,
  sku                  text NOT NULL,
  name                 text NOT NULL,
  category_id          uuid REFERENCES categories(id),
  brand_id             uuid REFERENCES brands(id),
  unit                 text NOT NULL DEFAULT 'UND',
  is_weighted          boolean NOT NULL DEFAULT false,
  track_stock          boolean NOT NULL DEFAULT true,
  allow_negative_stock boolean NOT NULL DEFAULT true,
  tax_ids              uuid[] NOT NULL DEFAULT '{}',
  base_price           numeric(14,2) NOT NULL,      -- con impuestos incluidos
  cost                 numeric(14,2),
  status               text NOT NULL DEFAULT 'ACTIVE',
  version              int NOT NULL DEFAULT 1,      -- control optimista para edición desde varias cajas
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  row_xid              xid8 NOT NULL DEFAULT pg_current_xact_id(),
  deleted_at           timestamptz,
  UNIQUE (tenant_id, sku)
);

CREATE TABLE product_barcodes (
  id          uuid PRIMARY KEY,
  tenant_id   uuid NOT NULL,
  product_id  uuid NOT NULL REFERENCES products(id),
  barcode     text NOT NULL,
  pack_qty    numeric(14,3) NOT NULL DEFAULT 1,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  row_xid     xid8 NOT NULL DEFAULT pg_current_xact_id(),
  deleted_at  timestamptz
);
CREATE UNIQUE INDEX ON product_barcodes (tenant_id, barcode) WHERE deleted_at IS NULL;

CREATE TABLE branch_prices (
  id          uuid PRIMARY KEY,
  tenant_id   uuid NOT NULL,
  branch_id   uuid NOT NULL,
  product_id  uuid NOT NULL REFERENCES products(id),
  price       numeric(14,2) NOT NULL,
  valid_from  timestamptz NOT NULL DEFAULT now(),
  valid_to    timestamptz,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  row_xid     xid8 NOT NULL DEFAULT pg_current_xact_id(),
  deleted_at  timestamptz
);
CREATE INDEX ON branch_prices (tenant_id, branch_id, product_id);

CREATE TABLE promotions (
  id          uuid PRIMARY KEY,
  tenant_id   uuid NOT NULL,
  name        text NOT NULL,
  kind        text NOT NULL,                        -- PERCENT|FIXED|NXM|BUNDLE
  rules       jsonb NOT NULL,
  branch_ids  uuid[],
  starts_at   timestamptz NOT NULL,
  ends_at     timestamptz NOT NULL,
  priority    int NOT NULL DEFAULT 100,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  row_xid     xid8 NOT NULL DEFAULT pg_current_xact_id(),
  deleted_at  timestamptz
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['taxes','categories','brands','products','product_barcodes','branch_prices','promotions'] LOOP
    EXECUTE format('CREATE TRIGGER trg_touch BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION app.touch_row()', t);
    PERFORM app.enable_tenant_rls(t::regclass);
  END LOOP;
END $$;
-- Artículos vendidos como "genérico" en caja, pendientes de crear como producto (alimentada por sales.recorded).
CREATE TABLE generic_item_sales (
  id           uuid PRIMARY KEY,                    -- id de la línea de venta
  tenant_id    uuid NOT NULL,
  branch_id    uuid NOT NULL,
  terminal_id  uuid NOT NULL,
  description  text NOT NULL,
  unit_price   numeric(14,2) NOT NULL,
  quantity     numeric(14,3) NOT NULL,
  sold_at      timestamptz NOT NULL,
  status       text NOT NULL DEFAULT 'PENDING',     -- PENDING | CREATED | IGNORED
  product_id   uuid REFERENCES products(id),        -- producto creado a partir de este registro
  resolved_by  uuid,
  resolved_at  timestamptz
);
CREATE INDEX ON generic_item_sales (tenant_id, status, sold_at DESC);
SELECT app.enable_tenant_rls('generic_item_sales');

-- Eventos: catalog.product.upserted/deleted, catalog.barcode.*, catalog.price.*, catalog.tax.*, catalog.promotion.*
