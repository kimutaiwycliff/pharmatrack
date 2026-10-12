import { formatKES, normalizeKePhone } from "@pharmatrack/core"
import { nairobiParts } from "../../../lib/sync/core/time"
import { cartTotals, lineTotals, sellQty, type CartItem } from "./cart"

// Customer receipt after a sale — the same data rendered as WhatsApp text and
// as an 80 mm HTML page for expo-print. Pure so the wording is tested once.

export interface ReceiptLine {
  name: string
  /** "2 × Strip of 10" / "3 tablets". */
  qtyLabel: string
  totalCents: number
  discountCents: number
}

export interface ReceiptData {
  shopName: string
  receiptNumber: string
  soldAtMs: number
  cashier: string
  lines: ReceiptLine[]
  subtotalCents: number
  discountCents: number
  totalCents: number
  paymentLabel: string
  paidCents: number
  changeCents: number
  mpesaReference: string | null
}

export function nairobiDateTime(ms: number): string {
  const p = nairobiParts(ms)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${pad(p.day)}/${pad(p.month)}/${p.year} ${pad(p.hour)}:${pad(p.minute)}`
}

export function receiptText(r: ReceiptData): string {
  const lines = r.lines.map((l) => `• ${l.name} — ${l.qtyLabel}: ${formatKES(l.totalCents)}`)
  return [
    `*${r.shopName}*`,
    `Receipt ${r.receiptNumber}`,
    nairobiDateTime(r.soldAtMs),
    "",
    ...lines,
    "",
    r.discountCents > 0 ? `Discount: -${formatKES(r.discountCents)}` : null,
    `*Total: ${formatKES(r.totalCents)}*`,
    `Paid (${r.paymentLabel}): ${formatKES(r.paidCents)}`,
    r.changeCents > 0 ? `Change: ${formatKES(r.changeCents)}` : null,
    r.mpesaReference ? `M-Pesa ref: ${r.mpesaReference}` : null,
    `Served by ${r.cashier}`,
    "",
    "Thank you — get well soon.",
  ]
    .filter((l): l is string => l !== null)
    .join("\n")
}

/**
 * WhatsApp deep link. With a Kenyan number → https://wa.me/2547… (opens that
 * chat); without → whatsapp://send (customer picks the chat). Returns null
 * when the phone was given but isn't a valid Kenyan mobile.
 */
export function whatsappUrl(text: string, phone?: string | null): string | null {
  const msg = encodeURIComponent(text)
  if (!phone || !phone.trim()) return `whatsapp://send?text=${msg}`
  const e164 = normalizeKePhone(phone)
  if (!/^\+254[17]\d{8}$/.test(e164)) return null
  return `https://wa.me/${e164.slice(1)}?text=${msg}`
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)

/** 80 mm thermal-width receipt (≈ 226 pt). */
export const RECEIPT_WIDTH_PT = 227

export function receiptHeightPt(r: ReceiptData): number {
  return 300 + r.lines.length * 34
}

export function receiptHtml(r: ReceiptData): string {
  const rows = r.lines
    .map(
      (l) => `<tr><td>${esc(l.name)}<div class="muted">${esc(l.qtyLabel)}${l.discountCents > 0 ? ` · -${esc(formatKES(l.discountCents))}` : ""}</div></td><td class="r">${esc(formatKES(l.totalCents))}</td></tr>`,
    )
    .join("")
  const row = (label: string, value: string, strong = false) =>
    `<tr${strong ? ' class="strong"' : ""}><td>${esc(label)}</td><td class="r">${esc(value)}</td></tr>`
  return `<!doctype html><html><head><meta charset="utf-8"/>
<style>
  @page { margin: 0; }
  body { font-family: -apple-system, Roboto, sans-serif; font-size: 10px; width: ${RECEIPT_WIDTH_PT - 16}pt; margin: 8pt; color: #000; }
  h1 { font-size: 13px; text-align: center; margin: 0 0 2px; }
  .c { text-align: center; } .muted { color: #555; font-size: 9px; } .r { text-align: right; white-space: nowrap; vertical-align: top; }
  table { width: 100%; border-collapse: collapse; } td { padding: 2px 0; }
  hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; } .strong td { font-weight: 700; font-size: 12px; }
</style></head><body>
<h1>${esc(r.shopName)}</h1>
<div class="c">Receipt ${esc(r.receiptNumber)}</div>
<div class="c muted">${esc(nairobiDateTime(r.soldAtMs))} · ${esc(r.cashier)}</div>
<hr/><table>${rows}</table><hr/>
<table>
${row("Subtotal", formatKES(r.subtotalCents))}
${r.discountCents > 0 ? row("Discount", `-${formatKES(r.discountCents)}`) : ""}
${row("Total", formatKES(r.totalCents), true)}
${row(`Paid (${r.paymentLabel})`, formatKES(r.paidCents))}
${r.changeCents > 0 ? row("Change", formatKES(r.changeCents)) : ""}
${r.mpesaReference ? row("M-Pesa ref", r.mpesaReference) : ""}
</table><hr/>
<div class="c">Thank you — get well soon.</div>
</body></html>`
}

// ── From the cart ───────────────────────────────────────────────────────────

/** "3 tablets" / "2 × Strip of 10". */
export function qtyLabel(i: Pick<CartItem, "quantity" | "baseUnit" | "sellUnit">): string {
  const n = sellQty(i)
  if (i.sellUnit) return `${n} × ${i.sellUnit.label}`
  return `${n} ${i.baseUnit}${n === 1 ? "" : "s"}`
}

export interface ReceiptPayment {
  label: string
  paidCents: number
  changeCents: number
  mpesaReference: string | null
}

/** Snapshot the cart into receipt data (taken before the cart is cleared). */
export function buildReceiptData(
  items: CartItem[],
  meta: { shopName: string; receiptNumber: string; soldAtMs: number; cashier: string },
  payment: ReceiptPayment,
): ReceiptData {
  const t = cartTotals(items)
  return {
    ...meta,
    lines: items.map((i) => {
      const lt = lineTotals(i)
      return {
        name: `${i.productName}${i.productStrength ? ` ${i.productStrength}` : ""}`,
        qtyLabel: qtyLabel(i),
        totalCents: lt.net,
        discountCents: lt.discount,
      }
    }),
    subtotalCents: t.subtotal,
    discountCents: t.discount,
    totalCents: t.total,
    paymentLabel: payment.label,
    paidCents: payment.paidCents,
    changeCents: payment.changeCents,
    mpesaReference: payment.mpesaReference,
  }
}
