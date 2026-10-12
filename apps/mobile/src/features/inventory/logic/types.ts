// Response shapes for the Inventory feature — checked against
// apps/web/app/api/inventory/route.ts (product_stock view rows + status_badges),
// apps/web/app/api/batches/route.ts (product_batch rows + branch_name) and the
// Offline Edition's src/repo/inventory.ts, which returns the same fields.
// Money is decimal KES (numbers or numeric strings). `cost_price` is OMITTED
// (not nulled) for roles without cost.view — lib/auth/costVisibility.ts's
// omitCost() — so it is optional everywhere and only shown when present.

export interface InventoryProduct {
  product_id: string
  name: string
  brand_name: string | null
  strength: string | null
  gtin: string | null
  selling_price: number | null
  cost_price?: number | null
  stock_on_hand: number | null
  reorder_level: number | null
  earliest_expiry: string | null
  expiry_days: number | null
  is_controlled: boolean | null
  base_unit?: string | null
  /** "out_of_stock" | "low_stock" | "ok" | "expiring" | "controlled" */
  status_badges: string[]
}

export interface InventorySummary {
  outOfStock: number
  lowStock: number
  expiring: number
  controlled: number
}

export interface InventoryResponse {
  products: InventoryProduct[]
  total: number
  page: number
  limit: number
  summary: InventorySummary
}

export interface Batch {
  id: string
  batch_number: string
  expiry_date: string
  quantity_remaining: number
  quantity_received: number
  cost_price?: string | number | null
  received_at?: string | null
  branch_id?: string | null
  /** Only when listing every branch (GET /api/batches without branch_id). */
  branch_name?: string | null
}

/** The bits of a product the receive form needs (search row, lookup or GET /api/products/[id]). */
export interface ReceiveProduct {
  id: string
  name: string
  strength: string | null
  brand_name: string | null
  gtin: string | null
  barcode_raw: string | null
  base_unit: string | null
  pack_label: string | null
  units_per_pack: number | null
  /** Per BASE unit, decimal KES; undefined when the role can't see cost. */
  cost_price?: number | null
  stock_on_hand?: number | null
}
