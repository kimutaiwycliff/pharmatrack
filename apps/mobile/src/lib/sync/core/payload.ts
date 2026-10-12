// Outbox item shapes — a hand-kept TypeScript mirror of the server's Zod
// contract in apps/web/lib/sync/push-schema.ts (shift_open, shift_close, sale,
// override). Money crosses the wire as decimal KES numbers (the server uses
// numeric KES, not cents); everything here is computed in integer cents and
// converted only when the payload is built (CLAUDE.md §2.4).

export interface ShiftOpenPayload {
  type: "shift_open"
  client_id: string
  cashier_id: string
  opened_at: string
  opening_float: number
}

export interface ShiftClosePayload {
  type: "shift_close"
  client_id: string
  closed_at: string
  closing_cash: number | null
  notes: string | null
  closed_by?: string
}

export interface OverridePayload {
  type: "override"
  client_id: string
  manager_id: string
  at: string
  until: string
  pending_sales: number
}

export interface SaleLinePayload {
  product_id: string
  product_name: string
  product_strength: string | null
  base_unit: string
  quantity: number
  unit_price: number
  discount_percent: number
  line_total: number
  is_controlled: boolean
  sell_unit: { pack_size_id: string; unit_count: number } | null
}

export interface SalePayload {
  type: "sale"
  client_id: string
  receipt_number: string
  cashier_id: string
  shift_client_id: string | null
  sold_at: string
  items: SaleLinePayload[]
  discount_amount: number
  total_amount: number
  payment_method: "cash" | "mpesa" | "split"
  cash_amount: number | null
  mpesa_amount: number | null
  mpesa_reference: string | null
  mpesa_verified: boolean
  amount_tendered: number | null
  change_given: number | null
  customer_name: string | null
  customer_phone: string | null
  override_client_id: string | null
}

export type PushItemPayload = ShiftOpenPayload | ShiftClosePayload | SalePayload | OverridePayload

// ── Sale builder ────────────────────────────────────────────────────────────

/** One cart line, in integer cents per BASE unit. */
export interface CartLineInput {
  productId: string
  productName: string
  productStrength: string | null
  baseUnit: string
  quantity: number
  unitPriceCents: number
  discountPercent: number
  isControlled: boolean
}

export type PaymentInput =
  | { method: "cash"; tenderedCents: number }
  | { method: "mpesa"; reference: string | null; verified: boolean }
  | { method: "split"; cashCents: number; mpesaCents: number; reference: string | null; verified: boolean }

export interface BuildSaleArgs {
  clientId: string
  receiptNumber: string
  cashierId: string
  shiftClientId: string | null
  soldAtMs: number
  lines: CartLineInput[]
  payment: PaymentInput
  overrideClientId?: string | null
  customerName?: string | null
  customerPhone?: string | null
}

export class SalePayloadError extends Error {}

const toKes = (cents: number) => Math.round(cents) / 100

/** Line maths shared with the cart: discount rounds half-up per line (applyDiscount). */
export function lineCents(line: Pick<CartLineInput, "quantity" | "unitPriceCents" | "discountPercent">) {
  const gross = line.unitPriceCents * line.quantity
  const discount = Math.round((gross * line.discountPercent) / 100)
  return { gross, discount, net: gross - discount }
}

export function saleTotalCents(lines: CartLineInput[]): number {
  return lines.reduce((s, l) => s + lineCents(l).net, 0)
}

export function buildSalePayload(a: BuildSaleArgs): SalePayload {
  if (a.lines.length === 0) throw new SalePayloadError("The cart is empty")
  for (const l of a.lines) {
    if (!Number.isInteger(l.quantity) || l.quantity <= 0) throw new SalePayloadError(`Bad quantity for ${l.productName}`)
    if (!Number.isInteger(l.unitPriceCents) || l.unitPriceCents < 0) throw new SalePayloadError(`Bad price for ${l.productName}`)
    if (l.discountPercent < 0 || l.discountPercent > 100) throw new SalePayloadError(`Bad discount for ${l.productName}`)
  }
  const totalCents = saleTotalCents(a.lines)

  const items: SaleLinePayload[] = a.lines.map((l) => ({
    product_id: l.productId,
    product_name: l.productName,
    product_strength: l.productStrength,
    base_unit: l.baseUnit,
    quantity: l.quantity,
    // Per-base-unit price charged before the line discount; the discount is
    // carried separately in discount_percent and already netted in line_total
    // (the server compares unit_price to the list price to flag mismatches).
    unit_price: toKes(l.unitPriceCents),
    discount_percent: l.discountPercent,
    line_total: toKes(lineCents(l).net),
    is_controlled: l.isControlled,
    sell_unit: null,
  }))

  const common = {
    type: "sale" as const,
    client_id: a.clientId,
    receipt_number: a.receiptNumber,
    cashier_id: a.cashierId,
    shift_client_id: a.shiftClientId,
    sold_at: new Date(a.soldAtMs).toISOString(),
    items,
    // Line discounts are already inside line_total; no extra sale-level discount.
    discount_amount: 0,
    total_amount: toKes(totalCents),
    customer_name: a.customerName ?? null,
    customer_phone: a.customerPhone ?? null,
    override_client_id: a.overrideClientId ?? null,
  }

  const p = a.payment
  if (p.method === "cash") {
    if (p.tenderedCents < totalCents) throw new SalePayloadError("Cash tendered doesn't cover the total")
    return {
      ...common,
      payment_method: "cash",
      cash_amount: null,
      mpesa_amount: null,
      mpesa_reference: null,
      mpesa_verified: true,
      amount_tendered: toKes(p.tenderedCents),
      change_given: toKes(p.tenderedCents - totalCents),
    }
  }
  if (p.method === "mpesa") {
    return {
      ...common,
      payment_method: "mpesa",
      cash_amount: null,
      mpesa_amount: null,
      mpesa_reference: p.reference?.trim() || null,
      mpesa_verified: p.verified,
      amount_tendered: toKes(totalCents),
      change_given: 0,
    }
  }
  if (p.cashCents < 0 || p.mpesaCents < 0 || Math.abs(p.cashCents + p.mpesaCents - totalCents) > 1) {
    throw new SalePayloadError("Cash + M-Pesa must add up to the total")
  }
  return {
    ...common,
    payment_method: "split",
    cash_amount: toKes(p.cashCents),
    mpesa_amount: toKes(p.mpesaCents),
    mpesa_reference: p.reference?.trim() || null,
    mpesa_verified: p.verified,
    amount_tendered: toKes(p.cashCents),
    change_given: 0,
  }
}

/** Cash that went into the drawer for a sale (for the local shift variance). */
export function cashCollectedCents(p: PaymentInput, totalCents: number): number {
  if (p.method === "cash") return totalCents
  if (p.method === "split") return p.cashCents
  return 0
}

/** Base units per product across a set of sale payloads (unsynced-sale adjustment). */
export function quantitiesByProduct(sales: Pick<SalePayload, "items">[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const s of sales) {
    for (const it of s.items) out.set(it.product_id, (out.get(it.product_id) ?? 0) + it.quantity)
  }
  return out
}

/** What the till may sell of a product: never more than the device's allowance or the cached stock. */
export function sellableQty(allowance: number | null | undefined, stock: number | null | undefined): number {
  return Math.max(0, Math.min(allowance ?? 0, stock ?? 0))
}
