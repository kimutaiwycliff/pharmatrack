// Pure stock maths shared by the Android (SQLite) and web/desktop (IndexedDB)
// tills: what this device may still sell once its unsynced sales are counted.

/** [product_id, stock_on_hand, earliest_expiry] */
export type StockRow = [string, number, string | null]
/** [product_id, quantity] */
export type AllowanceRow = [string, number]

/** Local stock = server stock − what this device sold but hasn't uploaded yet (never below 0). */
export function localStock(serverQty: number | undefined, pending: number | undefined): number {
  return Math.max(0, (serverQty ?? 0) - (pending ?? 0))
}

export function stockRows(stock: Map<string, { qty: number; expiry: string | null }>, pending: Map<string, number>): StockRow[] {
  const rows: StockRow[] = []
  for (const [id, s] of stock) rows.push([id, localStock(s.qty, pending.get(id)), s.expiry])
  return rows
}

/**
 * Allowance per product = server allocation − unsynced sales. Holds for a
 * refreshed allocation too: the server computed it from what it had been
 * sent, so any sale committed here since the refresh was requested (pending
 * at apply time) still has to come off it — never oversell.
 */
export function allowanceRows(items: { product_id: string; quantity: number }[], pending: Map<string, number>): AllowanceRow[] {
  return items.map((a) => [a.product_id, localStock(a.quantity, pending.get(a.product_id))])
}
