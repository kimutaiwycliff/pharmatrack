import type { DashboardDay, InventoryReportItem, InventoryStatus } from "../types"

// KPI derivations for the Dashboard and Reports. The APIs send decimal KES;
// everything here converts to integer cents first (ADR-008) so totals and
// differences never pick up float drift. Pure (no RN).

/** Decimal KES (number or numeric string) → integer cents; junk → 0. */
export function toCents(v: number | string | null | undefined): number {
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

export interface PaymentSplit {
  totalCents: number
  cashCents: number
  mpesaCents: number
  /** Card and anything else the API doesn't break out. */
  otherCents: number
}

/**
 * One day's takings by method. The dashboard API counts split sales in full
 * under M-Pesa (apps/web/app/api/dashboard/route.ts), so cash + M-Pesa never
 * exceeds the total; whatever is left is card / other.
 */
export function paymentSplit(day: Pick<DashboardDay, "total" | "cash" | "mpesa"> | undefined): PaymentSplit {
  if (!day) return { totalCents: 0, cashCents: 0, mpesaCents: 0, otherCents: 0 }
  const totalCents = toCents(day.total)
  const cashCents = toCents(day.cash)
  const mpesaCents = toCents(day.mpesa)
  return { totalCents, cashCents, mpesaCents, otherCents: Math.max(0, totalCents - cashCents - mpesaCents) }
}

/** "34.5% margin" from decimal-KES profit and revenue, or null with no revenue. */
export function marginLabel(profit: number, revenue: number): string | null {
  const rev = toCents(revenue)
  if (rev <= 0) return null
  return `${((toCents(profit) / rev) * 100).toFixed(1)}% margin`
}

/** Whole-number percentage label ("62%"), clamped to 0–100. */
export function percentLabel(v: number): string {
  const n = Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 0
  return `${Math.round(n)}%`
}

/**
 * A complete series over `days` — days with no sales get an empty entry so the
 * chart always shows the full week (the Offline Edition's local repo only
 * returns days that had sales).
 */
export function fillDailySeries<T extends { date: string }>(series: readonly T[], days: readonly string[], empty: (date: string) => T): T[] {
  const byDate = new Map(series.map((d) => [d.date, d]))
  return days.map((d) => byDate.get(d) ?? empty(d))
}

// ── Inventory report ─────────────────────────────────────────────────────────

export type InventoryFilter = "all" | Exclude<InventoryStatus, "ok"> | "controlled"

export const INVENTORY_FILTERS: { key: InventoryFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "out_of_stock", label: "Out of stock" },
  { key: "low_stock", label: "Low stock" },
  { key: "expiring", label: "Expiring" },
  { key: "controlled", label: "Controlled" },
]

/** Mirrors the status filter on apps/web/app/(dashboard)/reports/page.tsx. */
export function filterInventory<T extends Pick<InventoryReportItem, "status" | "is_controlled">>(items: readonly T[], filter: InventoryFilter): T[] {
  if (filter === "all") return [...items]
  if (filter === "controlled") return items.filter((i) => !!i.is_controlled)
  return items.filter((i) => i.status === filter)
}

export function inventoryStatusLabel(status: InventoryStatus): string {
  switch (status) {
    case "out_of_stock":
      return "Out of stock"
    case "low_stock":
      return "Low stock"
    case "expiring":
      return "Expiring"
    default:
      return "OK"
  }
}

/** "Expired" / "Expires in 12 days" for batches within 90 days, else null. */
export function expiryNote(expiryDays: number | null): string | null {
  if (expiryDays == null || expiryDays > 90) return null
  if (expiryDays < 0) return "Expired"
  if (expiryDays === 0) return "Expires today"
  return `Expires in ${expiryDays} day${expiryDays === 1 ? "" : "s"}`
}

export function paymentLabel(method: string): string {
  switch (method) {
    case "mpesa":
      return "M-Pesa"
    case "cash":
      return "Cash"
    case "card":
      return "Card"
    case "split":
      return "Split"
    default:
      return method
  }
}
