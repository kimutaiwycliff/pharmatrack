import { formatKES } from "@pharmatrack/core"
import type { ReceiptData, ReceiptLine } from "../../pos/logic/receipt"

// Sales history → the R2 receipt (features/pos/logic/receipt.ts), so a reprint
// is the exact WhatsApp text / 80 mm PDF the till produced at the time of sale.
// Pure: vitest covers the money maths. API money is decimal KES; everything is
// converted to integer cents once, here (CLAUDE.md rule 4).

/** One row of GET /api/sales (apps/web/app/api/sales/route.ts) — also what the
 *  Offline Edition's listLocalSales() returns. Only the fields shown. */
export interface SaleRow {
  id: string
  receipt_number: string | null
  created_at: string
  payment_method: string
  total_amount: number
  cashier_name: string
  item_count: number
}

export interface SalesResponse {
  sales: SaleRow[]
  total: number
  page: number
  limit: number
}

/** GET /api/sales/[id] (apps/web/app/api/sales/[id]/route.ts). Fields the
 *  Offline Edition's getLocalSaleDetail() doesn't return are optional. */
export interface SaleDetail {
  sale: {
    receipt_number: string | null
    created_at: string
    status?: string
    payment_method: string
    subtotal: number
    discount_amount: number
    tax_amount: number
    total_amount: number
    amount_tendered?: number | null
    change_given?: number | null
    mpesa_reference: string | null
    customer_phone?: string | null
    cashier_name: string
    org_name?: string | null
    branch_name: string | null
  }
  items: SaleDetailItem[]
}

export interface SaleDetailItem {
  product_id?: string | null
  product_name: string
  product_strength: string | null
  quantity: number
  unit_price: number
  discount_percent: number
  line_total: number
  base_unit: string | null
}

export const kesToCents = (v: number | string | null | undefined): number => {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

export function paymentLabel(method: string): string {
  switch (method) {
    case "cash":
      return "Cash"
    case "mpesa":
      return "M-Pesa"
    case "card":
      return "Card"
    case "split":
      return "Split"
    default:
      return titleCase(method)
  }
}

/** "partially_refunded" → "Partially refunded". */
export function titleCase(s: string | null | undefined): string {
  const t = (s ?? "").replace(/_/g, " ").trim()
  return t ? t[0]!.toUpperCase() + t.slice(1) : "—"
}

/** Split label matching the POS receipt ("Cash … + M-Pesa") when the cash part is known. */
export function splitLabel(cashCents: number | null): string {
  return cashCents != null && cashCents > 0 ? `Cash ${formatKES(cashCents)} + M-Pesa` : "Cash + M-Pesa"
}

/** "3 tablets" / "1 tablet" — the server stores quantity in base units only. */
export function baseQtyLabel(quantity: number, baseUnit: string | null | undefined): string {
  const unit = baseUnit?.trim() || "unit"
  return `${quantity} ${unit}${quantity === 1 || unit.endsWith("s") ? "" : "s"}`
}

/**
 * One receipt line from a stored line. The discount is what the line lost to
 * its discount_percent: gross (qty × unit price) − net, never negative (a pack
 * line's per-unit price is rounded to cents, so gross can land a cent under).
 */
export function lineFromStored(l: {
  name: string
  qtyLabel: string
  quantity: number
  unitPrice: number
  discountPercent: number
  lineTotal: number
}): ReceiptLine {
  const net = kesToCents(l.lineTotal)
  const gross = Math.round(l.quantity * Number(l.unitPrice) * 100)
  return {
    name: l.name,
    qtyLabel: l.qtyLabel,
    totalCents: net,
    discountCents: Number(l.discountPercent) > 0 ? Math.max(0, gross - net) : 0,
  }
}

const itemName = (name: string, strength: string | null | undefined) => `${name}${strength ? ` ${strength}` : ""}`

/**
 * FEFO splits one cart line across batches into several sale_item rows; the
 * customer bought one line, so rows for the same product at the same price and
 * discount are merged back before printing.
 */
export function mergeSaleItems(items: SaleDetailItem[]): SaleDetailItem[] {
  const out = new Map<string, SaleDetailItem>()
  for (const it of items) {
    const key = [it.product_id ?? "", it.product_name, it.product_strength ?? "", Number(it.unit_price), Number(it.discount_percent), it.base_unit ?? ""].join("|")
    const prev = out.get(key)
    if (prev) {
      out.set(key, {
        ...prev,
        quantity: prev.quantity + it.quantity,
        line_total: (kesToCents(prev.line_total) + kesToCents(it.line_total)) / 100,
      })
    } else {
      out.set(key, { ...it })
    }
  }
  return [...out.values()]
}

/** Receipt totals from the lines + the sale's own total (server is the source of truth). */
function totals(lines: ReceiptLine[], totalCents: number, saleDiscountCents: number) {
  const discountCents = lines.reduce((s, l) => s + l.discountCents, 0) + Math.max(0, saleDiscountCents)
  return { subtotalCents: totalCents + discountCents, discountCents, totalCents }
}

/** API (or Offline Edition) sale detail → R2 receipt input. */
export function saleDetailToReceipt(d: SaleDetail, fallbackShopName = "PharmaTrack"): ReceiptData {
  const s = d.sale
  const lines = mergeSaleItems(d.items).map((it) =>
    lineFromStored({
      name: itemName(it.product_name, it.product_strength),
      qtyLabel: baseQtyLabel(it.quantity, it.base_unit),
      quantity: it.quantity,
      unitPrice: it.unit_price,
      discountPercent: it.discount_percent,
      lineTotal: it.line_total,
    }),
  )
  const t = totals(lines, kesToCents(s.total_amount), kesToCents(s.discount_amount))
  const tendered = s.amount_tendered != null ? kesToCents(s.amount_tendered) : null
  const change = s.change_given != null ? kesToCents(s.change_given) : 0
  // amount_tendered is the cash handed over for cash sales and only the CASH
  // part for split sales (lib/sync/core/payload.ts); M-Pesa/card pay the total.
  const cash = s.payment_method === "cash"
  return {
    shopName: s.branch_name || s.org_name || fallbackShopName,
    receiptNumber: s.receipt_number ?? "—",
    soldAtMs: Date.parse(s.created_at),
    cashier: s.cashier_name || "—",
    lines,
    ...t,
    paymentLabel: s.payment_method === "split" ? splitLabel(tendered) : paymentLabel(s.payment_method),
    paidCents: cash && tendered != null ? Math.max(tendered, t.totalCents) : t.totalCents,
    changeCents: cash ? Math.max(0, change) : 0,
    mpesaReference: s.mpesa_reference ?? null,
  }
}

export interface SaleStatusBadge {
  status: "ok" | "warning" | "danger" | "neutral"
  label: string
}

/** Badge for a server sale's status; null for an ordinary completed sale. */
export function saleStatusBadge(status: string | null | undefined): SaleStatusBadge | null {
  if (!status || status === "completed") return null
  if (status === "voided" || status === "void" || status === "cancelled") return { status: "danger", label: status === "cancelled" ? "Cancelled" : "Voided" }
  if (status === "refunded" || status === "partially_refunded") return { status: "warning", label: status === "refunded" ? "Refunded" : "Part refunded" }
  return { status: "neutral", label: titleCase(status) }
}
