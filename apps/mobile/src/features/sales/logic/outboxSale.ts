import type { OutboxRecord } from "../../../lib/sync/outbox"
import type { SalePayload } from "../../../lib/sync/core/payload"
import type { ReceiptData } from "../../pos/logic/receipt"
import { baseQtyLabel, kesToCents, lineFromStored, paymentLabel, splitLabel } from "./receiptMapping"

// Sales recorded on this phone that the server hasn't accepted yet (R1
// outbox, lib/sync/outbox.ts). The outbox row's payload is the exact
// SalePayload that will be pushed (lib/sync/core/payload.ts) — that's all a
// receipt needs, so these show (and reprint) even with no connection. Pure.

export type LocalSaleStatus = "pending" | "rejected" | "synced" | "dismissed"

export interface LocalSaleRow {
  /** Outbox client_id (also the sale's client_id) — the /sales/[id]?source=outbox key. */
  clientId: string
  receiptNumber: string
  soldAtMs: number
  totalCents: number
  paymentMethod: string
  cashierId: string
  itemCount: number
  status: LocalSaleStatus
  /** Why the server refused it (rejected only). */
  errorMessage: string | null
}

/** The outbox payload as a sale, or null for other item types / unreadable JSON. */
export function parseSalePayload(rec: Pick<OutboxRecord, "type" | "payload">): SalePayload | null {
  if (rec.type !== "sale") return null
  try {
    const p = JSON.parse(rec.payload) as SalePayload
    return p && p.type === "sale" && Array.isArray(p.items) ? p : null
  } catch {
    return null
  }
}

export function outboxSaleRow(rec: Pick<OutboxRecord, "clientId" | "type" | "payload" | "status" | "errorMessage" | "createdAt">): LocalSaleRow | null {
  const p = parseSalePayload(rec)
  if (!p) return null
  const sold = Date.parse(p.sold_at)
  return {
    clientId: rec.clientId,
    receiptNumber: p.receipt_number,
    soldAtMs: Number.isFinite(sold) ? sold : rec.createdAt,
    totalCents: kesToCents(p.total_amount),
    paymentMethod: p.payment_method,
    cashierId: p.cashier_id,
    itemCount: p.items.length,
    status: rec.status,
    errorMessage: rec.status === "rejected" ? rec.errorMessage : null,
  }
}

/** Newest first; rejected ones float to the top so they're not missed. */
export function sortLocalSales(rows: LocalSaleRow[]): LocalSaleRow[] {
  return [...rows].sort((a, b) => {
    const ra = a.status === "rejected" ? 0 : 1
    const rb = b.status === "rejected" ? 0 : 1
    return ra - rb || b.soldAtMs - a.soldAtMs
  })
}

/** Same receipt-number search the server applies (ilike on receipt_number). */
export function matchesReceiptQuery(row: Pick<LocalSaleRow, "receiptNumber">, q: string): boolean {
  const t = q.trim().toLowerCase()
  return !t || row.receiptNumber.toLowerCase().includes(t)
}

/** "2 × pack of 10" for a pack line, "3 tablets" otherwise. */
export function payloadQtyLabel(it: SalePayload["items"][number]): string {
  if (it.sell_unit && it.sell_unit.unit_count > 0) {
    return `${Math.round(it.quantity / it.sell_unit.unit_count)} × pack of ${it.sell_unit.unit_count}`
  }
  return baseQtyLabel(it.quantity, it.base_unit)
}

/** Outbox sale payload → R2 receipt input (what the POS printed at the time). */
export function outboxSaleToReceipt(p: SalePayload, meta: { shopName: string; cashier: string }): ReceiptData {
  const lines = p.items.map((it) =>
    lineFromStored({
      name: `${it.product_name}${it.product_strength ? ` ${it.product_strength}` : ""}`,
      qtyLabel: payloadQtyLabel(it),
      quantity: it.quantity,
      unitPrice: it.unit_price,
      discountPercent: it.discount_percent,
      lineTotal: it.line_total,
    }),
  )
  const totalCents = kesToCents(p.total_amount)
  const discountCents = lines.reduce((s, l) => s + l.discountCents, 0) + Math.max(0, kesToCents(p.discount_amount))
  const cash = p.payment_method === "cash"
  const tendered = p.amount_tendered != null ? kesToCents(p.amount_tendered) : null
  return {
    shopName: meta.shopName,
    receiptNumber: p.receipt_number,
    soldAtMs: Date.parse(p.sold_at),
    cashier: meta.cashier,
    lines,
    subtotalCents: totalCents + discountCents,
    discountCents,
    totalCents,
    paymentLabel: p.payment_method === "split" ? splitLabel(p.cash_amount != null ? kesToCents(p.cash_amount) : null) : paymentLabel(p.payment_method),
    paidCents: cash && tendered != null ? Math.max(tendered, totalCents) : totalCents,
    changeCents: cash ? Math.max(0, kesToCents(p.change_given)) : 0,
    mpesaReference: p.mpesa_reference,
  }
}
