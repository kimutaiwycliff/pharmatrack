-- migrate:up
-- Make a product visible in a branch as soon as it is active — not only once it
-- has a batch there. Previously product_stock derived branch_id from
-- product_batch (LEFT JOIN ... GROUP BY p.id, pb.branch_id), so a product with
-- no batch produced a single row with branch_id = NULL. Inventory and POS both
-- filter `branch_id = <branch> AND is_active`, so seeded/activated-but-unstocked
-- products were invisible no matter the is_active toggle — you had to receive a
-- batch first. That blocks fast onboarding.
--
-- New shape: one row per (product × branch in the same org), with stock summed
-- for that specific branch. A product with no batch in a branch now appears with
-- stock_on_hand = 0 instead of vanishing. security_invoker is preserved, so RLS
-- on product/branch/product_batch still applies (a tenant only ever sees their
-- own products × their own branches).

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

-- migrate:down
DROP VIEW IF EXISTS product_stock;
CREATE VIEW product_stock WITH (security_invoker = true) AS
SELECT
  p.id AS product_id, p.organization_id, pb.branch_id,
  p.name, p.brand_name, p.strength, p.dosage_form, p.base_unit, p.pack_label,
  p.units_per_pack, p.selling_price, p.cost_price, p.reorder_level,
  p.is_controlled, p.requires_prescription, p.gtin, p.barcode_raw,
  p.category_id, p.is_active, p.image_url, p.max_discount_percent, p.catalog_id,
  COALESCE(SUM(pb.quantity_remaining) FILTER (WHERE pb.quantity_remaining > 0), 0)::int AS stock_on_hand,
  MIN(pb.expiry_date) FILTER (WHERE pb.quantity_remaining > 0) AS earliest_expiry,
  COUNT(pb.id) FILTER (WHERE pb.quantity_remaining > 0)::int AS batch_count
FROM product p
LEFT JOIN product_batch pb ON pb.product_id = p.id
GROUP BY p.id, pb.branch_id;
