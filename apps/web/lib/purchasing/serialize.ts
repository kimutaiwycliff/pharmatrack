import type { purchase_order, purchase_order_item } from "@pharmatrack/db"
import type { SuggestReason } from "./suggest"

type PoRow = typeof purchase_order.$inferSelect
type PoItemRow = typeof purchase_order_item.$inferSelect

export type PoStatus = "draft" | "sent" | "partially_received" | "received" | "cancelled"

export interface PurchaseOrderItemDTO {
  id: string
  product_id: string | null
  product_name: string
  product_strength: string | null
  pack_label: string | null
  units_per_pack: number
  quantity_ordered: number
  quantity_received: number
  unit_cost: number | null
  line_total: number | null
}

export interface PurchaseOrderDTO {
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

export function serializePoItem(row: PoItemRow): PurchaseOrderItemDTO {
  const unitCost = row.unit_cost == null ? null : Number(row.unit_cost)
  return {
    id: row.id,
    product_id: row.product_id,
    product_name: row.product_name,
    product_strength: row.product_strength,
    pack_label: row.pack_label,
    units_per_pack: row.units_per_pack,
    quantity_ordered: row.quantity_ordered,
    quantity_received: row.quantity_received,
    unit_cost: unitCost,
    line_total: unitCost == null ? null : Math.round(unitCost * row.quantity_ordered * 100) / 100,
  }
}

export function serializePo(
  row: PoRow,
  extra: {
    branch_name?: string | null
    supplier_name?: string | null
    supplier_phone?: string | null
    supplier_email?: string | null
    created_by_name?: string | null
    items: PurchaseOrderItemDTO[] | { count: number; total: number | null }
  },
): PurchaseOrderDTO {
  const summary = Array.isArray(extra.items)
    ? {
        count: extra.items.length,
        total: extra.items.some((i) => i.line_total == null) && extra.items.every((i) => i.line_total == null)
          ? null
          : Math.round(extra.items.reduce((s, i) => s + (i.line_total ?? 0), 0) * 100) / 100,
      }
    : extra.items
  return {
    id: row.id,
    po_number: row.po_number,
    status: row.status as PoStatus,
    branch_id: row.branch_id,
    branch_name: extra.branch_name ?? null,
    supplier_id: row.supplier_id,
    supplier_name: extra.supplier_name ?? null,
    supplier_phone: extra.supplier_phone ?? null,
    supplier_email: extra.supplier_email ?? null,
    expected_date: row.expected_date,
    notes: row.notes,
    created_at: row.created_at.toISOString(),
    sent_at: row.sent_at?.toISOString() ?? null,
    received_at: row.received_at?.toISOString() ?? null,
    created_by_name: extra.created_by_name ?? null,
    item_count: summary.count,
    total: summary.total,
  }
}

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
  /** Cost per PACK from history (last or weighted average); null when unknown or hidden. */
  cost_per_pack: number | null
  supplier_id: string | null
  supplier_name: string | null
}
