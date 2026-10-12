// Shapes returned by the purchase-order API — mirrors apps/web/lib/purchasing/
// serialize.ts (PurchaseOrderDTO / RestockSuggestion) and load.ts
// (PurchaseOrderDetail). Money is decimal KES (number) as the API sends it;
// cost fields are null when the viewer lacks cost.view (the server strips them).
// Pure: no React Native imports, so vitest can load it.

export type PoStatus = "draft" | "sent" | "partially_received" | "received" | "cancelled"

export interface PurchaseOrderSummary {
  id: string
  po_number: string
  status: PoStatus
  branch_id: string
  branch_name: string | null
  supplier_id: string | null
  supplier_name: string | null
  supplier_phone: string | null
  supplier_email: string | null
  expected_date: string | null
  notes: string | null
  created_at: string
  sent_at: string | null
  received_at: string | null
  created_by_name: string | null
  item_count: number
  total: number | null
}

export interface PoItem {
  id: string
  product_id: string | null
  product_name: string
  product_strength: string | null
  pack_label: string | null
  units_per_pack: number
  quantity_ordered: number
  quantity_received: number
  /** Expected cost per PACK. */
  unit_cost: number | null
  line_total: number | null
  gtin: string | null
  barcode_raw: string | null
  base_unit: string | null
  stock_on_hand: number | null
}

export interface PurchaseOrderDetail extends PurchaseOrderSummary {
  items: PoItem[]
}

export type SuggestReason = "out_of_stock" | "low_stock" | "demand"

export interface RestockSuggestion {
  product_id: string
  name: string
  strength: string | null
  base_unit: string
  pack_label: string | null
  units_per_pack: number
  stock_on_hand: number
  reorder_level: number
  sold: number
  avg_daily: number
  on_order: number
  suggested_packs: number
  reason: SuggestReason
  /** Cost per PACK; null when unknown or hidden. */
  cost_per_pack: number | null
  supplier_id: string | null
  supplier_name: string | null
}

/** Decimal KES from the API → integer cents (ADR-008: never float-sum money). */
export function kesToCents(v: number | string | null | undefined): number | null {
  if (v == null || v === "") return null
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n * 100) : null
}

/** "Box of 100" / "Pack of 10" / "tablet" — how a PO line is counted. */
export function packName(i: { pack_label: string | null; units_per_pack: number; base_unit?: string | null }): string {
  return i.pack_label ?? (i.units_per_pack > 1 ? `Pack of ${i.units_per_pack}` : (i.base_unit ?? "Unit"))
}

/** "12 tablets" / "1 tablet". */
export function unitsText(n: number, baseUnit: string | null | undefined): string {
  const u = baseUnit || "unit"
  return `${n.toLocaleString("en-KE")} ${u}${n === 1 ? "" : "s"}`
}
