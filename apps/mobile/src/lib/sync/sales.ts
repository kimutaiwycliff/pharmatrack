import { Q } from "@nozbe/watermelondb"
import { fromCents } from "@pharmatrack/core"
import { database } from "../../db/database"
import QueuedSale from "../../db/models/QueuedSale"
import { apiFetch } from "../api-fetch"
import type { CartItem } from "../../store/cart"

// Mirrors apps/web/app/api/sales/route.ts's saleSchema/cartItemSchema exactly
// (verified against the route's Zod schemas directly, not from memory).
interface SalePayload {
  branch_id: string
  shift_id: string | null
  items: {
    product_id: string
    product_name: string
    product_strength: string | null
    quantity: number
    unit_price: number
    discount_percent: number
    line_total: number
    base_unit: string
    is_controlled: boolean
  }[]
  discount_amount: number
  payment_method: "cash" | "mpesa" | "split"
  amount_tendered: number | null
  change_given: number | null
  mpesa_reference: string | null
  customer_name: string | null
  customer_phone: string | null
  offline_reference: string
}

// No shift clock-in flow on mobile yet (out of scope for this slice per
// ADR-013) — shift_id is nullable in the schema, so cash sales queue fine
// without one.
export function buildCashSalePayload(args: {
  branchId: string
  items: CartItem[]
  amountTendered: number
  totalCents: number
  offlineReference: string
}): SalePayload {
  const { branchId, items, amountTendered, totalCents, offlineReference } = args
  const amountTenderedCents = Math.round(amountTendered * 100)
  return {
    branch_id: branchId,
    shift_id: null,
    items: items.map((i) => {
      const lineTotalCents = i.unitPrice * i.quantity - Math.round((i.unitPrice * i.quantity * i.discountPercent) / 100)
      return {
        product_id: i.productId,
        product_name: i.productName,
        product_strength: i.productStrength,
        quantity: i.quantity,
        unit_price: Number(fromCents(i.unitPrice)),
        discount_percent: i.discountPercent,
        line_total: Number(fromCents(lineTotalCents)),
        base_unit: i.baseUnit,
        is_controlled: i.isControlled,
      }
    }),
    discount_amount: 0,
    payment_method: "cash",
    amount_tendered: Number(fromCents(amountTenderedCents)),
    change_given: Number(fromCents(amountTenderedCents - totalCents)),
    mpesa_reference: null,
    customer_name: null,
    customer_phone: null,
    offline_reference: offlineReference,
  }
}

export async function queueSale(payload: SalePayload): Promise<void> {
  const collection = database.get<QueuedSale>("queued_sales")
  await database.write(async () => {
    await collection.create((record) => {
      record.offlineReference = payload.offline_reference
      record.branchId = payload.branch_id
      record.payload = JSON.stringify(payload)
      record.status = "pending"
      record.serverResponse = null
      record.errorMessage = null
      record.createdAt = Date.now()
    })
  })
}

// Mirrors apps/web/lib/offline/sync.ts's syncOfflineSales() algorithm: process
// queued sales in order, 2xx -> synced, 4xx (not 429) -> permanent rejection,
// 5xx/429/network error -> stop and preserve queue order for the next attempt.
export async function syncQueuedSales(): Promise<{ synced: number; rejected: number }> {
  const collection = database.get<QueuedSale>("queued_sales")
  const pending = await collection.query(Q.where("status", "pending"), Q.sortBy("created_at", Q.asc)).fetch()

  let synced = 0
  let rejected = 0

  for (const sale of pending) {
    let response: Response
    try {
      response = await apiFetch("/api/sales", {
        method: "POST",
        body: sale.payload,
      })
    } catch {
      break // network error — stop, retry later
    }

    if (response.ok) {
      const body = await response.json().catch(() => null)
      await database.write(async () => {
        await sale.update((r) => {
          r.status = "synced"
          r.serverResponse = body ? JSON.stringify(body) : null
        })
      })
      synced++
      continue
    }

    if (response.status === 429 || response.status >= 500) {
      break // rate-limited/server error — stop, preserve order, retry later
    }

    // 4xx (not 429): permanent rejection (e.g. insufficient stock)
    const errorBody = await response.json().catch(() => ({}))
    await database.write(async () => {
      await sale.update((r) => {
        r.status = "rejected"
        r.errorMessage = (errorBody as { error?: string }).error ?? `HTTP ${response.status}`
      })
    })
    rejected++
  }

  return { synced, rejected }
}
