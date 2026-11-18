// Cashier station on the sales report (ADR-021): who served (sold_by) and
// which sales skipped the cashier in a branch that pays at one.

export interface StationSaleRow {
  id: string
  receipt_number: string | null
  created_at: Date
  total_amount: number
  cashier_id: string | null
  cashier_name: string | null
  sold_by_name: string | null
  branch_id: string
  branch_name: string | null
  counter_order_id: string | null
  offline_reference: string | null
}

/** How a sale came to skip the cashier: queued offline (always accepted),
 *  allowed by the branch (order desks may take payment), or neither. */
export type DirectHow = "offline" | "allowed" | "direct"

export function stationReport(
  rows: StationSaleRow[],
  opts: {
    /** Branches with the station switched on → whether they allow direct sales. */
    stationBranches: Map<string, { direct: boolean }>
    /** Whether this seller may run the cashier station (their own sales are fine). */
    canCollect: (userId: string | null) => boolean
    limit?: number
  },
) {
  const bySoldBy = new Map<string, { name: string; revenue: number; count: number }>()
  const direct: Array<{ id: string; receipt_number: string | null; created_at: Date; seller: string; branch: string; total_amount: number; how: DirectHow }> = []
  let throughCashier = 0
  for (const s of rows) {
    if (s.counter_order_id) {
      throughCashier += s.total_amount
      const name = s.sold_by_name ?? "Unknown"
      const e = bySoldBy.get(name) ?? { name, revenue: 0, count: 0 }
      e.revenue += s.total_amount; e.count++
      bySoldBy.set(name, e)
      continue
    }
    const station = opts.stationBranches.get(s.branch_id)
    if (!station || opts.canCollect(s.cashier_id)) continue
    direct.push({
      id: s.id, receipt_number: s.receipt_number, created_at: s.created_at, seller: s.cashier_name ?? "Unknown",
      branch: s.branch_name ?? "—", total_amount: s.total_amount,
      how: s.offline_reference ? "offline" : station.direct ? "allowed" : "direct",
    })
  }
  return {
    throughCashier,
    bySoldBy: [...bySoldBy.values()].sort((a, b) => b.revenue - a.revenue),
    directCount: direct.length,
    directTotal: direct.reduce((t, d) => t + d.total_amount, 0),
    direct: direct.slice(0, opts.limit ?? 100),
  }
}
