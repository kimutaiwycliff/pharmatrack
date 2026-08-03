import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core"

// Mirrors the `product_stock` view fields returned by
// GET /api/products/search?all=1&branch_id= (apps/web/app/api/products/search/route.ts)
// — the full-set catalogue fetch this app caches locally. No incremental sync;
// re-seeded wholesale on login/foreground/reconnect (see lib/sync/catalogue.ts).
export const products = sqliteTable("products", {
  productId: text("product_id").primaryKey(),
  name: text("name").notNull(),
  brandName: text("brand_name"),
  genericName: text("generic_name"),
  strength: text("strength"),
  dosageForm: text("dosage_form"),
  baseUnit: text("base_unit").notNull(),
  packLabel: text("pack_label"),
  unitsPerPack: integer("units_per_pack").notNull(),
  sellingPrice: real("selling_price").notNull(),
  costPrice: real("cost_price"),
  reorderLevel: integer("reorder_level").notNull(),
  isControlled: integer("is_controlled", { mode: "boolean" }).notNull(),
  requiresPrescription: integer("requires_prescription", { mode: "boolean" }).notNull(),
  gtin: text("gtin"),
  barcodeRaw: text("barcode_raw"),
  categoryId: text("category_id"),
  isActive: integer("is_active", { mode: "boolean" }).notNull(),
  imageUrl: text("image_url"),
  maxDiscountPercent: real("max_discount_percent"),
  catalogId: text("catalog_id"),
  stockOnHand: integer("stock_on_hand").notNull(),
  earliestExpiry: text("earliest_expiry"),
  batchCount: integer("batch_count").notNull(),
})

// Mirrors the Dexie `offlineSales` store (apps/web/lib/offline/db.ts) — one row
// per queued sale. `payload` is the JSON-serialized saleSchema request body
// (apps/web/app/api/sales/route.ts) sent as-is to POST /api/sales once synced.
export const queuedSales = sqliteTable("queued_sales", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  offlineReference: text("offline_reference").notNull().unique(),
  branchId: text("branch_id").notNull(),
  payload: text("payload").notNull(),
  status: text("status", { enum: ["pending", "synced", "rejected"] }).notNull(),
  serverResponse: text("server_response"),
  errorMessage: text("error_message"),
  createdAt: integer("created_at").notNull(),
})

// Last-known-good cache for data that's normally server-fetched (session/branch
// context, active shift) so a cold app start with no connectivity can still
// serve the offline POS instead of blocking behind a network error — see
// lib/kv.ts. Not a general settings store; only what POS needs offline.
export const kvStore = sqliteTable("kv_store", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
})

export type ProductRow = typeof products.$inferSelect
export type QueuedSaleRow = typeof queuedSales.$inferSelect
