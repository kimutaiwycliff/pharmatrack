import { listOutbox, type OutboxRecord } from "../../../lib/sync/outbox"
import { getRosterMember } from "../../../lib/sync/roster"
import type { SalePayload } from "../../../lib/sync/core/payload"
import { outboxSaleRow, parseSalePayload, sortLocalSales, type LocalSaleRow, type LocalSaleStatus } from "../logic/outboxSale"

// Reads this phone's not-yet-accepted sales straight from the outbox (online
// build only — the Offline Edition writes real sales to src/repo/sales.ts and
// has no outbox to show). Synchronous SQLite reads, so they're instant and
// work with no connection.

/** Pending + rejected sales, rejected first then newest. */
export function readUnsyncedSales(): LocalSaleRow[] {
  const recs = [...listOutbox("pending", 500), ...listOutbox("rejected", 200)]
  const rows: LocalSaleRow[] = []
  for (const r of recs) {
    const row = outboxSaleRow(r)
    if (row) rows.push(row)
  }
  return sortLocalSales(rows)
}

export interface OutboxSale {
  payload: SalePayload
  status: LocalSaleStatus
  errorMessage: string | null
}

/** One outbox sale by client id, whatever its state (it may have synced since the list was read). */
export function readOutboxSale(clientId: string): OutboxSale | null {
  const states: OutboxRecord["status"][] = ["pending", "rejected", "synced", "dismissed"]
  for (const status of states) {
    const rec = listOutbox(status, 1000).find((r) => r.clientId === clientId)
    if (!rec) continue
    const payload = parseSalePayload(rec)
    if (!payload) return null
    return { payload, status: rec.status, errorMessage: rec.status === "rejected" ? rec.errorMessage : null }
  }
  return null
}

/** Cashier name from the offline staff roster (the payload only carries the id). */
export function cashierName(cashierId: string, fallback = "—"): string {
  try {
    return getRosterMember(cashierId)?.name ?? fallback
  } catch {
    return fallback
  }
}
