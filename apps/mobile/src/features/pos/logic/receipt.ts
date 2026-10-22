import {
  applyReceiptProfile, formatKES, normalizeKePhone, qrSvg, receiptFooterLines, receiptHeaderLines, receiptQtyText,
  type ReceiptBranchInfo, type ReceiptDoc, type ReceiptProfile,
} from "@pharmatrack/core"
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

/** The till's receipt (cents already) → the shared receipt model the printer uses. */
export function receiptDocFromReceipt(r: ReceiptData, extra?: { branchName?: string | null; address?: string | null; phone?: string | null }): ReceiptDoc {
  return {
    shopName: r.shopName,
    branchName: extra?.branchName ?? null,
    address: extra?.address ?? null,
    phone: extra?.phone ?? null,
    receiptNumber: r.receiptNumber,
    dateText: nairobiDateTime(r.soldAtMs),
    cashier: r.cashier,
    lines: r.lines.map((l) => ({ name: l.name, qtyLabel: l.qtyLabel, totalCents: l.totalCents, discountCents: l.discountCents })),
    subtotalCents: r.subtotalCents,
    discountCents: r.discountCents,
    totalCents: r.totalCents,
    paymentLabel: r.paymentLabel,
    paidCents: r.paidCents,
    changeCents: r.changeCents,
    mpesaReference: r.mpesaReference,
  }
}

/**
 * The receipt as customers get it: the sale plus the pharmacy's Settings →
 * Receipt header/footer (from /api/mobile/me, cached for offline use). Without
 * a profile (Offline Edition, first launch offline) it's the plain layout.
 */
export function brandedReceipt(r: ReceiptData, profile: ReceiptProfile | null | undefined, branch?: ReceiptBranchInfo): ReceiptDoc {
  return applyReceiptProfile(receiptDocFromReceipt(r, { branchName: branch?.name, address: branch?.address, phone: branch?.phone }), profile, branch)
}

export function receiptText(d: ReceiptDoc): string {
  const lines = d.lines.map((l) => `• ${l.name} — ${receiptQtyText(l)}: ${formatKES(l.totalCents)}`)
  const footer = receiptFooterLines(d)
  return [
    `*${d.shopName}*`,
    ...receiptHeaderLines(d),
    "",
    `Receipt ${d.receiptNumber}`,
    d.dateText,
    "",
    ...lines,
    "",
    d.discountCents > 0 ? `Discount: -${formatKES(d.discountCents)}` : null,
    `*Total: ${formatKES(d.totalCents)}*`,
    `Paid (${d.paymentLabel}): ${formatKES(d.paidCents ?? d.totalCents)}`,
    d.changeCents && d.changeCents > 0 ? `Change: ${formatKES(d.changeCents)}` : null,
    d.mpesaReference ? `M-Pesa ref: ${d.mpesaReference}` : null,
    d.cashier ? `Served by ${d.cashier}` : null,
    ...(footer.length ? ["", ...footer] : []),
    ...(d.qrData ? ["", d.qrCaption ? `${d.qrCaption}: ${d.qrData}` : d.qrData] : []),
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

export function receiptHeightPt(d: ReceiptDoc): number {
  return 260 + d.lines.length * 34 + (receiptHeaderLines(d).length + receiptFooterLines(d).length) * 13 + (d.logoDataUrl ? 60 : 0) + (d.qrData ? 120 : 0)
}

export function receiptHtml(d: ReceiptDoc): string {
  const rows = d.lines
    .map(
      (l) => `<tr><td>${esc(l.name)}<div class="muted">${esc(receiptQtyText(l))}${l.discountCents ? ` · -${esc(formatKES(l.discountCents))}` : ""}</div></td><td class="r">${esc(formatKES(l.totalCents))}</td></tr>`,
    )
    .join("")
  const row = (label: string, value: string, strong = false) =>
    `<tr${strong ? ' class="strong"' : ""}><td>${esc(label)}</td><td class="r">${esc(value)}</td></tr>`
  const header = receiptHeaderLines(d).map((l) => `<div class="c muted">${esc(l)}</div>`).join("")
  const footer = receiptFooterLines(d).map((l) => `<div class="c">${esc(l)}</div>`).join("")
  // The logo is validated server-side (PNG/JPEG data URL only), so it's safe in src.
  const logo = d.logoDataUrl && /^data:image\/(png|jpeg);base64,/.test(d.logoDataUrl) ? `<img class="logo" src="${d.logoDataUrl}"/>` : ""
  const qr = d.qrData ? `<div class="c qr">${qrSvg(d.qrData, 90)}${d.qrCaption ? `<div class="muted">${esc(d.qrCaption)}</div>` : ""}</div>` : ""
  return `<!doctype html><html><head><meta charset="utf-8"/>
<style>
  @page { margin: 0; }
  body { font-family: -apple-system, Roboto, sans-serif; font-size: 10px; width: ${RECEIPT_WIDTH_PT - 16}pt; margin: 8pt; color: #000; }
  h1 { font-size: 13px; text-align: center; margin: 0 0 2px; }
  .c { text-align: center; } .muted { color: #555; font-size: 9px; } .r { text-align: right; white-space: nowrap; vertical-align: top; }
  .logo { display: block; margin: 0 auto 4px; max-height: 48pt; max-width: 70%; object-fit: contain; } .qr { margin-top: 8px; }
  table { width: 100%; border-collapse: collapse; } td { padding: 2px 0; }
  hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; } .strong td { font-weight: 700; font-size: 12px; }
</style></head><body>
${logo}<h1>${esc(d.shopName)}</h1>
${header}
<hr/>
<div class="c">Receipt ${esc(d.receiptNumber)}</div>
<div class="c muted">${esc(d.dateText)}${d.cashier ? ` · ${esc(d.cashier)}` : ""}</div>
${d.customer ? `<div class="c muted">Customer: ${esc(d.customer)}</div>` : ""}
<hr/><table>${rows}</table><hr/>
<table>
${row("Subtotal", formatKES(d.subtotalCents))}
${d.discountCents > 0 ? row("Discount", `-${formatKES(d.discountCents)}`) : ""}
${row("Total", formatKES(d.totalCents), true)}
${row(`Paid (${d.paymentLabel})`, formatKES(d.paidCents ?? d.totalCents))}
${d.changeCents && d.changeCents > 0 ? row("Change", formatKES(d.changeCents)) : ""}
${d.mpesaReference ? row("M-Pesa ref", d.mpesaReference) : ""}
</table>${footer ? `<hr/>${footer}` : ""}${qr}
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
