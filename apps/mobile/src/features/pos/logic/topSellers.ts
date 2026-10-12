// "Quick add" tiles = what this device sells most, computed from its own
// outbox sale payloads (works offline, no server report needed).

export interface SaleLike {
  items: { product_id: string; quantity: number }[]
}

/** Product ids ranked by how many sales included them, then by base units sold. */
export function topSellers(sales: SaleLike[], limit: number): string[] {
  const stats = new Map<string, { sales: number; qty: number; first: number }>()
  let order = 0
  for (const s of sales) {
    const seen = new Set<string>()
    for (const it of s.items) {
      const st = stats.get(it.product_id) ?? { sales: 0, qty: 0, first: order++ }
      if (!seen.has(it.product_id)) st.sales++
      st.qty += it.quantity
      seen.add(it.product_id)
      stats.set(it.product_id, st)
    }
  }
  return [...stats.entries()]
    .sort(([, a], [, b]) => b.sales - a.sales || b.qty - a.qty || a.first - b.first)
    .slice(0, limit)
    .map(([id]) => id)
}
