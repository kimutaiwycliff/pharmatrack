import { getUnsyncedSales, markSaleSynced, deleteOfflineSale } from "./db"
import { isUuid } from "@/lib/utils"

export interface SyncResult {
  synced: number
  dropped: number
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
          customer_name: null,
          customer_phone: s.customerPhone,
          offline_reference: s.saleId, // server can dedupe on this
        }),
      })
      if (!res.ok) break
      if (s.id != null) await markSaleSynced(s.id)
      synced++
    } catch {
      break
    }
  }

  return { synced, dropped }
}
