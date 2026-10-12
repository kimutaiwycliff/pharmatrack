import type { RestockSuggestion, SuggestReason } from "./types"

// Restock suggestions grouped one draft order per supplier — the same grouping
// as web's restock planner (apps/web/app/(dashboard)/purchase-orders/new/
// page.tsx): named suppliers A→Z, "No supplier yet" last. The create body
// matches POST /api/purchase-orders' Zod schema (branch_id, supplier_id,
// items[{product_id, quantity_ordered, units_per_pack, pack_label, unit_cost?}]).

export const REASON_LABEL: Record<SuggestReason, string> = {
  out_of_stock: "Out of stock",
  low_stock: "Low",
  demand: "Selling fast",
}

export function reasonBadge(reason: SuggestReason): "danger" | "warning" | "neutral" {
  return reason === "out_of_stock" ? "danger" : reason === "low_stock" ? "warning" : "neutral"
}

export interface SuggestionGroup {
  /** supplier id, or NO_SUPPLIER */
  key: string
  supplierId: string | null
  supplierName: string
  items: RestockSuggestion[]
  /** Estimated budget in integer cents; null when no line has a visible cost. */
  totalCents: number | null
}

export const NO_SUPPLIER = "__none__"

export function groupSuggestions(list: RestockSuggestion[]): SuggestionGroup[] {
  const map = new Map<string, SuggestionGroup>()
  for (const s of list) {
    const key = s.supplier_id ?? NO_SUPPLIER
    let g = map.get(key)
    if (!g) {
      g = { key, supplierId: s.supplier_id, supplierName: s.supplier_id ? (s.supplier_name ?? "Supplier") : "No supplier yet", items: [], totalCents: null }
      map.set(key, g)
    }
    g.items.push(s)
    if (s.cost_per_pack != null) g.totalCents = (g.totalCents ?? 0) + Math.round(s.cost_per_pack * 100) * s.suggested_packs
  }
  return [...map.values()].sort((a, b) =>
    a.key === NO_SUPPLIER ? 1 : b.key === NO_SUPPLIER ? -1 : a.supplierName.localeCompare(b.supplierName),
  )
}

/** "40 tablets on hand · sells 3.5/day · 20 on order" */
export function suggestionHint(s: RestockSuggestion): string {
  return [
    `${s.stock_on_hand} ${s.base_unit}s on hand`,
    s.avg_daily > 0 ? `sells ${s.avg_daily}/day` : "no recent sales",
    s.on_order > 0 ? `${s.on_order} on order` : null,
  ]
    .filter(Boolean)
    .join(" · ")
}

export interface CreateOrderBody {
  branch_id: string
  supplier_id: string | null
  items: { product_id: string; quantity_ordered: number; units_per_pack: number; pack_label: string | null; unit_cost?: number | null }[]
}

/** Draft PO body for one supplier group. Cost is only sent by people who can see it (server ignores it otherwise). */
export function buildDraftOrderBody(branchId: string, group: SuggestionGroup, canSeeCost: boolean): CreateOrderBody {
  return {
    branch_id: branchId,
    supplier_id: group.supplierId,
    items: group.items
      .filter((s) => s.suggested_packs > 0)
      .map((s) => ({
        product_id: s.product_id,
        quantity_ordered: s.suggested_packs,
        units_per_pack: s.units_per_pack,
        pack_label: s.pack_label,
        ...(canSeeCost ? { unit_cost: s.cost_per_pack } : {}),
      })),
  }
}
