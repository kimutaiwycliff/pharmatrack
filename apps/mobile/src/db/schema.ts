import { appSchema, tableSchema } from "@nozbe/watermelondb"

// Mirrors the `product_stock` view fields returned by
// GET /api/products/search?all=1&branch_id= (apps/web/app/api/products/search/route.ts)
// — the full-set catalogue fetch this app caches locally. No incremental sync;
// re-seeded wholesale on login/foreground/reconnect (see lib/sync/catalogue.ts).
const products = tableSchema({
  name: "products",
  columns: [
    { name: "product_id", type: "string", isIndexed: true },
    { name: "name", type: "string" },
    { name: "brand_name", type: "string", isOptional: true },
    { name: "generic_name", type: "string", isOptional: true },
    { name: "strength", type: "string", isOptional: true },
    { name: "dosage_form", type: "string", isOptional: true },
    { name: "base_unit", type: "string" },
    { name: "pack_label", type: "string", isOptional: true },
    { name: "units_per_pack", type: "number" },
    { name: "selling_price", type: "number" },
    { name: "cost_price", type: "number", isOptional: true },
    { name: "reorder_level", type: "number" },
    { name: "is_controlled", type: "boolean" },
    { name: "requires_prescription", type: "boolean" },
    { name: "gtin", type: "string", isOptional: true },
    { name: "barcode_raw", type: "string", isOptional: true, isIndexed: true },
    { name: "category_id", type: "string", isOptional: true },
    { name: "is_active", type: "boolean" },
    { name: "image_url", type: "string", isOptional: true },
    { name: "max_discount_percent", type: "number", isOptional: true },
    { name: "catalog_id", type: "string", isOptional: true },
    { name: "stock_on_hand", type: "number" },
    { name: "earliest_expiry", type: "string", isOptional: true },
    { name: "batch_count", type: "number" },
  ],
})

// Mirrors the Dexie `offlineSales` store (apps/web/lib/offline/db.ts) — one row
// per queued sale. `payload` is the JSON-serialized saleSchema request body
// (apps/web/app/api/sales/route.ts) sent as-is to POST /api/sales once synced.
const queuedSales = tableSchema({
  name: "queued_sales",
  columns: [
    { name: "offline_reference", type: "string", isIndexed: true },
    { name: "branch_id", type: "string" },
    { name: "payload", type: "string" },
    { name: "status", type: "string", isIndexed: true }, // pending | synced | rejected
    { name: "server_response", type: "string", isOptional: true },
    { name: "error_message", type: "string", isOptional: true },
    { name: "created_at", type: "number" },
  ],
})

export const schema = appSchema({
  version: 1,
  tables: [products, queuedSales],
})
