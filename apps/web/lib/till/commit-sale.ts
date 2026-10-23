"use client"

import { formatKES } from "@pharmatrack/core"
import {
  buildSalePayload, cashCollectedCents, computeLock, EMPTY_ANCHORS, formatReceiptNumber, lockMessage, nairobiYYMMDD,
  nextReceiptSeq, sellableQty, trustedNow, type CartLineInput, type PaymentInput, type SalePayload,
} from "@pharmatrack/core/sync"
import type { CartItem } from "@pharmatrack/types"
import { getMeta, tillDB, type TillDB } from "./db"
import { enqueue } from "./outbox"

// The only way a registered till records a sale — online or offline (the
// web twin of apps/mobile/src/lib/sync/commit-sale.ts). One IndexedDB
// transaction: re-check every line against min(allowance, local stock), take
// the next receipt number, decrement allowance + stock, add the cash to the
// local shift and write the outbox row. Any failure rolls all of it back, so
// the till can never oversell or leave a gap in its receipt numbers.

export class AllowanceError extends Error {
  constructor(
    public productId: string,
    public productName: string,
    public available: number,
    public wanted: number,
  ) {
    super(available > 0 ? `Only ${available} of ${productName} left on this computer` : `${productName}: none left on this computer`)
    this.name = "AllowanceError"
  }
}

export class TillLockedError extends Error {}

export interface CommitSaleInput {
  cashierId: string
  shiftClientId: string
  lines: CartLineInput[]
  payment: PaymentInput
  discountCents?: number
  customerPhone?: string | null
}

export interface CommitSaleResult {
  clientId: string
  receiptNumber: string
  payload: SalePayload
  totalCents: number
}

/** Web cart lines (KES) → the shared payload builder's lines (integer cents, base units). */
export function cartToLines(items: CartItem[]): CartLineInput[] {
  return items.map((i) => ({
    productId: i.product_id,
    productName: i.product_name,
    productStrength: i.product_strength,
    baseUnit: i.base_unit,
    quantity: i.quantity,
    unitPriceCents: Math.round(i.unit_price * 100),
    discountPercent: i.discount_percent ?? 0,
    isControlled: i.is_controlled,
    sellUnit: i.sell_unit
      ? { packSizeId: i.sell_unit.pack_size_id, unitCount: i.sell_unit.unit_count, packPriceCents: Math.round(i.sell_unit.price * 100) }
      : null,
  }))
}

/** What this till may sell of each product right now (min of allowance and local stock). */
export async function sellableFor(productIds: string[], db: TillDB = tillDB()): Promise<Map<string, number>> {
  const [products, allowances] = await Promise.all([db.products.bulkGet(productIds), db.allowances.bulkGet(productIds)])
  const out = new Map<string, number>()
  productIds.forEach((id, i) => out.set(id, sellableQty(allowances[i]?.quantity, products[i]?.stock_on_hand)))
  return out
}

export async function commitTillSale(input: CommitSaleInput, db: TillDB = tillDB()): Promise<CommitSaleResult> {
  const clientId = crypto.randomUUID()
  let result: CommitSaleResult | null = null

  await db.transaction("rw", [db.products, db.allowances, db.counters, db.shifts, db.outbox, db.meta], async () => {
    const [device, meta] = await Promise.all([getMeta("device", db), getMeta("sync", db)])
    if (!device) throw new TillLockedError("This computer isn't set up for selling yet.")
    // Belt and braces: the POS shows a lock screen, but never record a sale while locked.
    const lock = computeLock({
      now: trustedNow({ ...EMPTY_ANCHORS, ...(meta?.clock ?? {}) }, Date.now()),
      registered: true, revoked: !!meta?.revoked, clockTampered: !!meta?.clock?.tampered,
      deadline: meta?.deadline ?? null, override: meta?.override ?? null,
    })
    if (lock.locked && lock.reason) throw new TillLockedError(lockMessage(lock.reason, "computer"))
    const shift = await db.shifts.get(input.shiftClientId)
    if (!shift || shift.open !== 1) throw new TillLockedError("Start a shift before selling.")

    const wanted = new Map<string, { qty: number; name: string }>()
    for (const l of input.lines) {
      const w = wanted.get(l.productId) ?? { qty: 0, name: l.productName }
      w.qty += l.quantity
      wanted.set(l.productId, w)
    }
    const ids = [...wanted.keys()]
    const sellable = await sellableFor(ids, db)
    for (const [id, w] of wanted) {
      const available = sellable.get(id) ?? 0
      if (w.qty > available) throw new AllowanceError(id, w.name, available, w.qty)
    }

    // Daily receipt counter per device: D01-261023-0007.
    const now = Date.now()
    const dateKey = nairobiYYMMDD(now)
    const counterKey = `${device.code}:${dateKey}`
    const prev = await db.counters.get(counterKey)
    const seq = nextReceiptSeq(prev ? { dateKey, lastSeq: prev.last_seq } : null, dateKey)
    await db.counters.put({ key: counterKey, last_seq: seq })
    const receiptNumber = formatReceiptNumber(device.code, now, seq)

    const underOverride = lock.underOverride && meta?.override ? meta.override.client_id : null
    const payload = buildSalePayload({
      clientId, receiptNumber, cashierId: input.cashierId, shiftClientId: input.shiftClientId, soldAtMs: now,
      lines: input.lines, payment: input.payment, overrideClientId: underOverride,
      discountCents: input.discountCents ?? 0, customerPhone: input.customerPhone ?? null,
    })
    const totalCents = Math.round(payload.total_amount * 100)

    const [products, allowances] = await Promise.all([db.products.bulkGet(ids), db.allowances.bulkGet(ids)])
    ids.forEach((id, i) => {
      const qty = wanted.get(id)!.qty
      const a = allowances[i]
      const p = products[i]
      if (a) a.quantity = Math.max(0, a.quantity - qty)
      if (p) p.stock_on_hand = Math.max(0, p.stock_on_hand - qty)
    })
    await db.allowances.bulkPut(allowances.filter((a): a is NonNullable<typeof a> => !!a))
    await db.products.bulkPut(products.filter((p): p is NonNullable<typeof p> => !!p))
    await db.shifts.update(shift.client_id, {
      cash_sales_cents: shift.cash_sales_cents + cashCollectedCents(input.payment, totalCents),
      sales_count: shift.sales_count + 1,
    })
    await enqueue(clientId, payload, `Sale ${receiptNumber} · ${formatKES(totalCents)}`, db)
    result = { clientId, receiptNumber, payload, totalCents }
  })

  if (!result) throw new Error("Sale was not recorded")
  return result
}

/** Sales recorded on this till, newest first (for reprints). */
export async function recentTillSales(limit = 50, db: TillDB = tillDB()) {
  const rows = await db.outbox.where("type").equals("sale").toArray()
  return rows.sort((a, b) => b.created_at - a.created_at).slice(0, limit)
}
