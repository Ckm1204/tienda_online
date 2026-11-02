-- inventory-service: bodegas, libro de movimientos, existencias, traslados.

CREATE TABLE warehouses (
  id          uuid PRIMARY KEY,
  tenant_id   uuid NOT NULL,
  branch_id   uuid NOT NULL,
  name        text NOT NULL,
  is_default  boolean NOT NULL DEFAULT true
);

CREATE TABLE stock_movements (
  id           uuid NOT NULL,
  tenant_id    uuid NOT NULL,
  warehouse_id uuid NOT NULL,
  product_id   uuid NOT NULL,
  quantity     numeric(14,3) NOT NULL,              -- delta con signo
  kind         text NOT NULL,                       -- SALE|RETURN|ADJUST_IN|ADJUST_OUT|SHRINKAGE|DAMAGE|INTERNAL_USE|EXPIRED|RECEIPT|TRANSFER_OUT|TRANSFER_IN|COUNT_CORRECTION
  reason       text,
  source_type  text,
  source_id    uuid,
  unit_cost    numeric(14,2),
  occurred_at  timestamptz NOT NULL,
  created_by   uuid,
  received_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, occurred_at)
) PARTITION BY RANGE (occurred_at);
CREATE INDEX ON stock_movements (tenant_id, warehouse_id, product_id, occurred_at);

CREATE TABLE stock_levels (
  tenant_id    uuid NOT NULL,
  warehouse_id uuid NOT NULL,
  product_id   uuid NOT NULL,
  on_hand      numeric(14,3) NOT NULL DEFAULT 0,
  avg_cost     numeric(14,2),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, warehouse_id, product_id)
);

CREATE TABLE stock_transfers (
  id             uuid PRIMARY KEY,
  tenant_id      uuid NOT NULL,
  from_warehouse uuid NOT NULL,
  to_warehouse   uuid NOT NULL,
  status         text NOT NULL,                     -- DRAFT|IN_TRANSIT|RECEIVED|RECEIVED_WITH_DIFF|CANCELLED
  lines          jsonb NOT NULL,
  created_by     uuid NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  received_at    timestamptz
);

CREATE TABLE suppliers (
  id           uuid PRIMARY KEY,
  tenant_id    uuid NOT NULL,
  name         text NOT NULL,                       -- "Distribuidora El Sol", "Postobón"
  doc_type     text,
  doc_number   text,
  phone        text,                                -- pedidos por WhatsApp
  visit_days   smallint[],                          -- días de visita del preventista (1=lunes)
  created_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);

CREATE TABLE purchase_receipts (
  id           uuid PRIMARY KEY,
  tenant_id    uuid NOT NULL,
  warehouse_id uuid NOT NULL REFERENCES warehouses(id),
  supplier_id  uuid REFERENCES suppliers(id),
  reference    text,                                -- número de factura/remisión del proveedor
  lines        jsonb NOT NULL,                      -- [{product_id, qty, unit_cost}]
  total        numeric(14,2) NOT NULL,
  paid_from_cash_session uuid,                      -- si se pagó con efectivo de la caja
  received_by  uuid NOT NULL,
  received_at  timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['warehouses','stock_movements','stock_levels','stock_transfers','suppliers','purchase_receipts'] LOOP
    PERFORM app.enable_tenant_rls(t::regclass);
  END LOOP;
END $$;
-- Consume: pos.events (sale.completed, sale.returned, inventory.*)
-- Publica: inventory.level_changed (→ sync stock_snapshot, reporting), inventory.negative_detected
