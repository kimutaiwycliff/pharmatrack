import { getUnsyncedSales, markSaleSynced } from "./db"

/**
 * Flush queued offline sales to the server. Stops at the first failure (likely
 * still offline) so the rest stay queued. Returns the number synced.
 */
export async function syncOfflineSales(): Promise<number> {
  const sales = await getUnsyncedSales()
  let synced = 0

  for (const s of sales) {
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

  return synced
}
