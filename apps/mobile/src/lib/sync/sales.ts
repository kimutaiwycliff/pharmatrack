import { asc, eq } from "drizzle-orm"
import { fromCents } from "@pharmatrack/core"
import { db } from "../../db/database"
import { queuedSales } from "../../db/schema"
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
  await db.insert(queuedSales).values({
    offlineReference: payload.offline_reference,
    branchId: payload.branch_id,
    payload: JSON.stringify(payload),
    status: "pending",
    serverResponse: null,
    errorMessage: null,
    createdAt: Date.now(),
  })
}

// Mirrors apps/web/lib/offline/sync.ts's syncOfflineSales() algorithm: process
// queued sales in order, 2xx -> synced, 4xx (not 429) -> permanent rejection,
// 5xx/429/network error -> stop and preserve queue order for the next attempt.
export async function syncQueuedSales(): Promise<{ synced: number; rejected: number }> {
  const pending = await db
    .select()
    .from(queuedSales)
    .where(eq(queuedSales.status, "pending"))
    .orderBy(asc(queuedSales.createdAt))

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
      await db
        .update(queuedSales)
        .set({ status: "synced", serverResponse: body ? JSON.stringify(body) : null })
        .where(eq(queuedSales.id, sale.id))
      synced++
      continue
    }

    if (response.status === 429 || response.status >= 500) {
      break // rate-limited/server error — stop, preserve order, retry later
    }

    // 4xx (not 429): permanent rejection (e.g. insufficient stock)
    const errorBody = await response.json().catch(() => ({}))
    await db
      .update(queuedSales)
      .set({ status: "rejected", errorMessage: (errorBody as { error?: string }).error ?? `HTTP ${response.status}` })
      .where(eq(queuedSales.id, sale.id))
    rejected++
  }

  return { synced, rejected }
}
