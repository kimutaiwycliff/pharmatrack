-- ============================================================
-- rebuild product_stock view
-- ============================================================
-- Reconstructed during migration-history reconciliation (originally applied
-- directly, never committed). Rebuilds the product_stock view from 001 to
-- surface image_url / max_discount_percent and to count batches with stock via
-- FILTER (so out-of-stock batches no longer suppress the earliest_expiry).

CREATE OR REPLACE VIEW product_stock AS
SELECT
  p.id AS product_id,
  p.organization_id,
  pb.branch_id,
  p.name,
  p.brand_name,
  p.strength,
  p.dosage_form,
  p.base_unit,
  p.pack_label,
  p.units_per_pack,
  p.selling_price,
  p.cost_price,
  p.reorder_level,
  p.is_controlled,
  p.requires_prescription,
  p.gtin,
  p.barcode_raw,
  p.category_id,
  p.is_active,
  p.image_url,
  p.max_discount_percent,
  COALESCE(SUM(pb.quantity_remaining), 0) AS stock_on_hand,
  MIN(CASE WHEN pb.quantity_remaining > 0 THEN pb.expiry_date ELSE NULL END) AS earliest_expiry,
  COUNT(DISTINCT pb.id) FILTER (WHERE pb.quantity_remaining > 0) AS batch_count
FROM products p
LEFT JOIN product_batches pb ON pb.product_id = p.id
GROUP BY p.id, pb.branch_id;
