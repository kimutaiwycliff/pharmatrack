import * as Crypto from "expo-crypto"
import { formatKES } from "@pharmatrack/core"
import { sqlite } from "../../db/database"
import { enqueue } from "./outbox"
import {
  buildSalePayload, cashCollectedCents, saleTotalCents, sellableQty,
  type CartLineInput, type PaymentInput, type SalePayload,
} from "./core/payload"
import { formatReceiptNumber, nextReceiptSeq } from "./core/receipt"
import { nairobiYYMMDD } from "./core/time"

// R1 rules 2 + 7 — the only way a sale is recorded in the online build. One
// SQLite transaction: re-check every line against min(allowance, cached
// stock), take the next receipt number, decrement allowance + stock, add the
// cash to the local shift and write the outbox row. Any failure rolls all of
// it back, so the till can never oversell or lose a receipt number gap.

export class AllowanceError extends Error {
  constructor(
    public productId: string,
    public productName: string,
    public available: number,
  ) {
    super(available > 0 ? `Only ${available} of ${productName} left on this device` : `${productName}: none left on this device`)
  }
}

export interface CommitSaleInput {
  deviceCode: string
  cashierId: string
  shiftClientId: string
  lines: CartLineInput[]
  payment: PaymentInput
  overrideClientId: string | null
}

export interface CommitSaleResult {
  clientId: string
  receiptNumber: string
  payload: SalePayload
  totalCents: number
}

/** Current sellable quantity per product (min of allowance and cached stock). */
export function sellableFor(productIds: string[]): Map<string, number> {
  const out = new Map<string, number>()
  if (productIds.length === 0) return out
  for (let i = 0; i < productIds.length; i += 500) {
    const chunk = productIds.slice(i, i + 500)
    const rows = sqlite.getAllSync<{ id: string; stock: number; allowance: number | null }>(
      `SELECT p.product_id AS id, p.stock_on_hand AS stock, a.quantity AS allowance
       FROM products p LEFT JOIN allowances a ON a.product_id = p.product_id
       WHERE p.product_id IN (${chunk.map(() => "?").join(",")})`,
      chunk,
    )
    for (const r of rows) out.set(r.id, sellableQty(r.allowance, r.stock))
  }
  return out
}

export function commitDeviceSale(input: CommitSaleInput): CommitSaleResult {
  const now = Date.now()
  const clientId = Crypto.randomUUID()
  const totalCents = saleTotalCents(input.lines)
  let result: CommitSaleResult | null = null

  sqlite.withTransactionSync(() => {
    const wanted = new Map<string, { qty: number; name: string }>()
    for (const l of input.lines) {
      const w = wanted.get(l.productId) ?? { qty: 0, name: l.productName }
      w.qty += l.quantity
      wanted.set(l.productId, w)
    }
    const sellable = sellableFor([...wanted.keys()])
    for (const [id, w] of wanted) {
      const available = sellable.get(id) ?? 0
      if (w.qty > available) throw new AllowanceError(id, w.name, available)
    }

    // Daily receipt counter, keyed per device code (receipt_counters is shared
    // with the Offline Edition, which keys it by branch id instead).
    const dateKey = nairobiYYMMDD(now)
    const counterKey = `device:${input.deviceCode}`
    const prev = sqlite.getFirstSync<{ lastSeq: number }>(
      "SELECT last_seq AS lastSeq FROM receipt_counters WHERE branch_id = ? AND date_key = ?",
      [counterKey, dateKey],
    )
    const seq = nextReceiptSeq(prev ? { dateKey, lastSeq: prev.lastSeq } : null, dateKey)
    sqlite.runSync(
      `INSERT INTO receipt_counters (branch_id, date_key, last_seq) VALUES (?, ?, ?)
       ON CONFLICT(branch_id, date_key) DO UPDATE SET last_seq = excluded.last_seq`,
      [counterKey, dateKey, seq],
    )
    const receiptNumber = formatReceiptNumber(input.deviceCode, now, seq)

    const payload = buildSalePayload({
      clientId,
      receiptNumber,
      cashierId: input.cashierId,
      shiftClientId: input.shiftClientId,
      soldAtMs: now,
      lines: input.lines,
      payment: input.payment,
      overrideClientId: input.overrideClientId,
    })

    for (const [id, w] of wanted) {
      sqlite.runSync("UPDATE allowances SET quantity = quantity - ?, updated_at = ? WHERE product_id = ?", [w.qty, now, id])
      sqlite.runSync("UPDATE products SET stock_on_hand = stock_on_hand - ? WHERE product_id = ?", [w.qty, id])
    }
    sqlite.runSync(
      "UPDATE local_shifts SET cash_sales_cents = cash_sales_cents + ?, sales_count = sales_count + 1 WHERE client_id = ?",
      [cashCollectedCents(input.payment, totalCents), input.shiftClientId],
    )
    enqueue(clientId, payload, `Sale ${receiptNumber} · ${formatKES(totalCents)}`)
    result = { clientId, receiptNumber, payload, totalCents }
  })

  if (!result) throw new Error("Sale was not recorded")
  return result
}
