import { getUnsyncedSales, markSaleSynced, deleteOfflineSale } from "./db"
import { isUuid } from "@/lib/utils"

export interface SyncResult {
  synced: number
  dropped: number
  /** Server rejected permanently (e.g. 409 insufficient stock) — removed from the queue. */
  rejected: number
}

/**
 * Flush queued offline sales to the server. Malformed entries (which can never
 * succeed — e.g. a missing/empty branch id from an earlier bug) are dropped so
 * one poison record can't block the queue forever. Stops at the first genuine
 * failure (likely still offline) so the rest stay queued.
 */
export async function syncOfflineSales(): Promise<SyncResult> {
  const sales = await getUnsyncedSales()
  let synced = 0
  let dropped = 0
  let rejected = 0

  for (const s of sales) {
    // Drop records that would always fail server validation.
    const valid =
      isUuid(s.branchId) &&
      Array.isArray(s.items) &&
      s.items.length > 0 &&
      s.items.every((i) => isUuid(i.product_id))
    if (!valid) {
      if (s.id != null) await deleteOfflineSale(s.id)
      dropped++
      continue
    }

    try {
      const res = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branch_id: s.branchId,
          shift_id: s.shiftId,
          items: s.items,
          discount_amount: s.discount,
          payment_method: s.paymentMethod,
          amount_tendered: s.amountTendered,
          change_given: null,
          mpesa_reference: s.mpesaReference,
          cash_amount: s.cashAmount,
          mpesa_amount: s.mpesaAmount,
          customer_name: null,
          customer_phone: s.customerPhone,
          offline_reference: s.saleId, // server can dedupe on this
        }),
      })
      if (res.ok) {
        if (s.id != null) await markSaleSynced(s.id)
        synced++
      } else if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        // Permanent rejection (e.g. 409 insufficient stock, 400 invalid) — it can
        // never succeed on retry, so drop it instead of blocking the queue.
        if (s.id != null) await deleteOfflineSale(s.id)
        rejected++
      } else {
        // 5xx / 429 / transient — stop and keep the rest queued for next time.
        break
      }
    } catch {
      break
    }
  }

  return { synced, dropped, rejected }
}
