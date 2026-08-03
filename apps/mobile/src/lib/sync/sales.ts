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
  // Only meaningful when payment_method === "split" (the server's saleSchema
  // marks these optional+nullable and only reads them in the split branch).
  cash_amount: number | null
  mpesa_amount: number | null
  customer_name: string | null
  customer_phone: string | null
  offline_reference: string
}

function buildSaleItems(items: CartItem[]): SalePayload["items"] {
  return items.map((i) => {
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
  })
}

interface BaseSaleArgs {
  branchId: string
  shiftId: string
  items: CartItem[]
  totalCents: number
  offlineReference: string
}

// Discriminated on paymentMethod so each branch only accepts the fields it
// actually needs — mirrors apps/web/app/(pos)/pos/page.tsx's three onConfirm
// call sites (CashModal/MpesaModal/SplitModal) exactly.
export type BuildSalePayloadArgs =
  | (BaseSaleArgs & { paymentMethod: "cash"; amountTenderedCents: number })
  | (BaseSaleArgs & { paymentMethod: "mpesa"; mpesaReference: string | null })
  | (BaseSaleArgs & {
      paymentMethod: "split"
      cashAmountCents: number
      mpesaAmountCents: number
      mpesaReference: string | null
    })

// shiftId is required (not nullable): a null shift_id never joins to
// sale.shift_id in the clock-out variance calc (payment.method='cash' joined
// via sale.shift_id), so sales would silently vanish from till variance and
// shift reporting. The caller (pos.tsx) must block checkout until a shift is
// open — see the Shifts screen for clock-in.
export function buildSalePayload(args: BuildSalePayloadArgs): SalePayload {
  const { branchId, shiftId, items, totalCents, offlineReference } = args
  const base = {
    branch_id: branchId,
    shift_id: shiftId,
    items: buildSaleItems(items),
    discount_amount: 0,
    customer_name: null,
    customer_phone: null,
    offline_reference: offlineReference,
  } as const

  if (args.paymentMethod === "cash") {
    const { amountTenderedCents } = args
    return {
      ...base,
      payment_method: "cash",
      amount_tendered: Number(fromCents(amountTenderedCents)),
      change_given: Number(fromCents(amountTenderedCents - totalCents)),
      mpesa_reference: null,
      cash_amount: null,
      mpesa_amount: null,
    }
  }

  if (args.paymentMethod === "mpesa") {
    // Full total tendered via M-Pesa; no change given (matches web's
    // submitSale({ paymentMethod: "mpesa", amountTendered: total, changeGiven: 0, ... })).
    return {
      ...base,
      payment_method: "mpesa",
      amount_tendered: Number(fromCents(totalCents)),
      change_given: 0,
      mpesa_reference: args.mpesaReference,
      cash_amount: null,
      mpesa_amount: null,
    }
  }

  // split: amount_tendered is the CASH portion only (not the total) — matches
  // web's submitSale({ paymentMethod: "split", amountTendered: cashAmt, changeGiven: 0, ... }).
  const { cashAmountCents, mpesaAmountCents } = args
  return {
    ...base,
    payment_method: "split",
    amount_tendered: Number(fromCents(cashAmountCents)),
    change_given: 0,
    mpesa_reference: args.mpesaReference,
    cash_amount: Number(fromCents(cashAmountCents)),
    mpesa_amount: Number(fromCents(mpesaAmountCents)),
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
