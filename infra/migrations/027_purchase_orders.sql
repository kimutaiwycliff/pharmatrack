-- migrate:up
-- Purchase orders: plan a restock, send it to a supplier, then receive the
-- delivery against it (batches with batch number / expiry / cost).
-- Quantities and costs on PO lines are per PACK (what's on the supplier's
-- invoice); receiving converts to base units for product_batch.

CREATE SEQUENCE IF NOT EXISTS purchase_order_number_seq;
GRANT USAGE, SELECT ON SEQUENCE purchase_order_number_seq TO app_authenticated;

CREATE TABLE purchase_order (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  branch_id       uuid NOT NULL REFERENCES branch(id) DEFERRABLE INITIALLY DEFERRED,
  supplier_id     uuid REFERENCES supplier(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  po_number       text NOT NULL,
  status          text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'sent', 'partially_received', 'received', 'cancelled')),
  expected_date   date,
  notes           text,
  created_by      text REFERENCES "user"("id") ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  sent_at         timestamptz,
  received_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, po_number)
);
CREATE INDEX idx_po_org_status ON purchase_order(organization_id, status, created_at DESC);

CREATE TABLE purchase_order_item (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id  uuid NOT NULL REFERENCES purchase_order(id) ON DELETE CASCADE,
  product_id         uuid REFERENCES product(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  product_name       text NOT NULL,           -- snapshot, survives product deletion
  product_strength   text,
  pack_label         text,
  units_per_pack     integer NOT NULL DEFAULT 1 CHECK (units_per_pack > 0),
  quantity_ordered   integer NOT NULL CHECK (quantity_ordered > 0),     -- packs
  quantity_received  integer NOT NULL DEFAULT 0 CHECK (quantity_received >= 0), -- packs
  unit_cost          numeric(12,2),           -- expected cost per pack
  sort_order         integer NOT NULL DEFAULT 0
);
CREATE INDEX idx_po_item_po ON purchase_order_item(purchase_order_id);
CREATE INDEX idx_po_item_product ON purchase_order_item(product_id);

-- Trace each received batch back to the PO line it came in on.
ALTER TABLE product_batch
  ADD COLUMN purchase_order_item_id uuid REFERENCES purchase_order_item(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE purchase_order ENABLE ROW LEVEL SECURITY;
CREATE POLICY purchase_order_rls ON purchase_order FOR ALL
  USING (organization_id = public.user_organization_id() AND public.branch_visible(branch_id))
  WITH CHECK (organization_id = public.user_organization_id() AND public.branch_visible(branch_id));

ALTER TABLE purchase_order_item ENABLE ROW LEVEL SECURITY;
CREATE POLICY purchase_order_item_rls ON purchase_order_item FOR ALL
  USING (purchase_order_id IN (
    SELECT id FROM purchase_order
    WHERE organization_id = public.user_organization_id() AND public.branch_visible(branch_id)))
  WITH CHECK (purchase_order_id IN (
    SELECT id FROM purchase_order
    WHERE organization_id = public.user_organization_id() AND public.branch_visible(branch_id)));

-- migrate:down
ALTER TABLE product_batch DROP COLUMN IF EXISTS purchase_order_item_id;
DROP TABLE IF EXISTS purchase_order_item;
DROP TABLE IF EXISTS purchase_order;
DROP SEQUENCE IF EXISTS purchase_order_number_seq;
