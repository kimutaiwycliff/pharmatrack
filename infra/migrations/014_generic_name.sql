-- migrate:up
-- "Related products": a generic_name (molecule) groups variants so searching a
-- product surfaces other strengths and the generic↔brand alternatives.
ALTER TABLE product ADD COLUMN IF NOT EXISTS generic_name text;
ALTER TABLE drug_catalog ADD COLUMN IF NOT EXISTS generic_name text;

CREATE INDEX IF NOT EXISTS idx_product_generic ON product (organization_id, generic_name);
CREATE INDEX IF NOT EXISTS idx_product_generic_trgm ON product USING gin (generic_name gin_trgm_ops);

-- Surface generic_name through the product_stock view (POS/inventory read surface).
DROP VIEW IF EXISTS product_stock;
CREATE VIEW product_stock WITH (security_invoker = true) AS
SELECT
  p.id AS product_id, p.organization_id, b.id AS branch_id,
  p.name, p.brand_name, p.generic_name, p.strength, p.dosage_form, p.base_unit, p.pack_label,
  p.units_per_pack, p.selling_price, p.cost_price, p.reorder_level,
  p.is_controlled, p.requires_prescription, p.gtin, p.barcode_raw,
  p.category_id, p.is_active, p.image_url, p.max_discount_percent, p.catalog_id,
  COALESCE(SUM(pb.quantity_remaining) FILTER (WHERE pb.quantity_remaining > 0), 0)::int AS stock_on_hand,
  MIN(pb.expiry_date) FILTER (WHERE pb.quantity_remaining > 0) AS earliest_expiry,
  COUNT(pb.id) FILTER (WHERE pb.quantity_remaining > 0)::int AS batch_count
FROM product p
JOIN branch b ON b.organization_id = p.organization_id
LEFT JOIN product_batch pb ON pb.product_id = p.id AND pb.branch_id = b.id
GROUP BY p.id, b.id;

-- migrate:down
DROP VIEW IF EXISTS product_stock;
CREATE VIEW product_stock WITH (security_invoker = true) AS
SELECT
  p.id AS product_id, p.organization_id, b.id AS branch_id,
  p.name, p.brand_name, p.strength, p.dosage_form, p.base_unit, p.pack_label,
  p.units_per_pack, p.selling_price, p.cost_price, p.reorder_level,
  p.is_controlled, p.requires_prescription, p.gtin, p.barcode_raw,
  p.category_id, p.is_active, p.image_url, p.max_discount_percent, p.catalog_id,
  COALESCE(SUM(pb.quantity_remaining) FILTER (WHERE pb.quantity_remaining > 0), 0)::int AS stock_on_hand,
  MIN(pb.expiry_date) FILTER (WHERE pb.quantity_remaining > 0) AS earliest_expiry,
  COUNT(pb.id) FILTER (WHERE pb.quantity_remaining > 0)::int AS batch_count
FROM product p
JOIN branch b ON b.organization_id = p.organization_id
LEFT JOIN product_batch pb ON pb.product_id = p.id AND pb.branch_id = b.id
GROUP BY p.id, b.id;
DROP INDEX IF EXISTS idx_product_generic_trgm;
DROP INDEX IF EXISTS idx_product_generic;
ALTER TABLE product DROP COLUMN IF EXISTS generic_name;
ALTER TABLE drug_catalog DROP COLUMN IF EXISTS generic_name;
