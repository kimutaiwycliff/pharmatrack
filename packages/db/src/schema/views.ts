import { pgView, uuid, text, boolean, numeric, integer, date } from "drizzle-orm/pg-core"

// product_stock is created by infra/migrations/004_domain.sql (security_invoker,
// so RLS on product/product_batch applies through it). `.existing()` tells
// Drizzle the view is managed by SQL — this is just the typed query surface.
export const product_stock = pgView("product_stock", {
  product_id: uuid("product_id"),
  organization_id: text("organization_id"),
  branch_id: uuid("branch_id"),
  name: text("name"),
  brand_name: text("brand_name"),
  strength: text("strength"),
  dosage_form: text("dosage_form"),
  base_unit: text("base_unit"),
  pack_label: text("pack_label"),
  units_per_pack: integer("units_per_pack"),
  selling_price: numeric("selling_price"),
  cost_price: numeric("cost_price"),
  reorder_level: integer("reorder_level"),
  is_controlled: boolean("is_controlled"),
  requires_prescription: boolean("requires_prescription"),
  gtin: text("gtin"),
  barcode_raw: text("barcode_raw"),
  category_id: uuid("category_id"),
  is_active: boolean("is_active"),
  image_url: text("image_url"),
  max_discount_percent: numeric("max_discount_percent"),
  catalog_id: uuid("catalog_id"),
  stock_on_hand: integer("stock_on_hand"),
  earliest_expiry: date("earliest_expiry"),
  batch_count: integer("batch_count"),
}).existing()
