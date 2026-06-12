-- ============================================================
-- 005 — Supplier management + product↔supplier link
-- ============================================================
-- Adds a deactivation flag to suppliers (soft-remove, mirroring branches)
-- and a default supplier reference on products. Stock batches already
-- record the actual per-delivery supplier (product_batches.supplier_id);
-- products.supplier_id is the preferred/default source for reordering.

ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

ALTER TABLE products  ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES suppliers(id);

CREATE INDEX IF NOT EXISTS idx_products_supplier ON products(supplier_id) WHERE supplier_id IS NOT NULL;
