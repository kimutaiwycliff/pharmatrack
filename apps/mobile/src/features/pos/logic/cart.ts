import { lineCents, type CartLineInput } from "../../../lib/sync/core/payload"

// Pure cart model (no React Native imports — vitest runs these). The zustand
// store in src/store/cart.ts holds CartItem[]; every total the UI shows and
// every line the sale commit sends goes through the helpers below, so the
// screen and the uploaded payload can never disagree.

/** Selling a whole pack (strip/box) instead of the base unit. */
export interface CartSellUnit {
  packSizeId: string
  label: string
  /** Base units in one pack. */
  unitCount: number
  /** Price of one pack, integer cents. */
  priceCents: number
}

export interface CartItem {
  productId: string
  productName: string
  productStrength: string | null
  /** Always in BASE units (packs × unitCount for a pack line). */
  quantity: number
  /** List price per base unit, integer cents. */
  unitPrice: number
  discountPercent: number
  baseUnit: string
  isControlled: boolean
  requiresPrescription: boolean
  // What the till may still sell of this product: the device's sellable
  // allowance (R1, min(allowance, cached stock)) or the branch's cached stock
  // in the Offline Edition. Caps quantity — never oversell.
  stockOnHand: number
  // Product cap on discountPercent; null = no product-specific cap.
  maxDiscountPercent: number | null
  sellUnit: CartSellUnit | null
}

/** Base units per one sell unit (1 when selling the base unit). */
export const unitsPerSell = (i: Pick<CartItem, "sellUnit">) => i.sellUnit?.unitCount ?? 1
/** Quantity in the unit being sold (packs, or base units). */
export const sellQty = (i: Pick<CartItem, "quantity" | "sellUnit">) => Math.floor(i.quantity / unitsPerSell(i))
/** Price of one sell unit, cents. */
export const sellPriceCents = (i: Pick<CartItem, "unitPrice" | "sellUnit">) => i.sellUnit?.priceCents ?? i.unitPrice
/** Name of the unit being sold ("tablet", "Strip of 10"). */
export const sellUnitLabel = (i: Pick<CartItem, "baseUnit" | "sellUnit">) => i.sellUnit?.label ?? i.baseUnit
/** Most sell units allowed by the stock/allowance cap. */
export const maxSellQty = (i: Pick<CartItem, "stockOnHand" | "sellUnit">) => Math.max(0, Math.floor(i.stockOnHand / unitsPerSell(i)))

/** Discount clamped to 0..product cap (or 100 when uncapped). */
export function clampDiscount(percent: number, cap: number | null): number {
  if (!Number.isFinite(percent)) return 0
  return Math.max(0, Math.min(percent, cap ?? 100))
}

export function toCartLineInput(i: CartItem): CartLineInput {
  return {
    productId: i.productId,
    productName: i.productName,
    productStrength: i.productStrength,
    baseUnit: i.baseUnit,
    quantity: i.quantity,
    unitPriceCents: i.unitPrice,
    discountPercent: i.discountPercent,
    isControlled: i.isControlled,
    sellUnit: i.sellUnit
      ? { packSizeId: i.sellUnit.packSizeId, unitCount: i.sellUnit.unitCount, packPriceCents: i.sellUnit.priceCents }
      : null,
  }
}

export const lineTotals = (i: CartItem) => lineCents(toCartLineInput(i))

export interface CartTotals {
  subtotal: number
  discount: number
  total: number
  /** Sum of sell quantities ("3 items"). */
  count: number
}

export function cartTotals(items: CartItem[]): CartTotals {
  let subtotal = 0
  let discount = 0
  let count = 0
  for (const i of items) {
    const t = lineTotals(i)
    subtotal += t.gross
    discount += t.discount
    count += sellQty(i)
  }
  return { subtotal, discount, total: subtotal - discount, count }
}

/** True when anything in the cart needs a prescription seen before payment. */
export function needsPrescriptionCheck(items: CartItem[]): { required: boolean; controlled: boolean } {
  const controlled = items.some((i) => i.isControlled)
  return { required: controlled || items.some((i) => i.requiresPrescription), controlled }
}

// ── Lines per product ───────────────────────────────────────────────────────
// A product can sit in the cart twice — loose tablets AND a whole strip — so a
// line is keyed by product + pack size, while the stock/allowance cap is
// shared by every line of that product.

/** Stable id of a cart line: product + the pack being sold ("" = base unit). */
export const lineKey = (i: Pick<CartItem, "productId" | "sellUnit">) => `${i.productId}|${i.sellUnit?.packSizeId ?? ""}`

/** Base units of `productId` already in the cart, optionally ignoring one line. */
export function baseQtyInCart(items: CartItem[], productId: string, exceptKey?: string): number {
  return items.reduce((s, i) => (i.productId === productId && lineKey(i) !== exceptKey ? s + i.quantity : s), 0)
}

/** Most sell units this line may hold once the product's other lines are counted. */
export function lineCap(items: CartItem[], line: CartItem): number {
  const free = line.stockOnHand - baseQtyInCart(items, line.productId, lineKey(line))
  return Math.max(0, Math.floor(free / unitsPerSell(line)))
}

/** Base units of the product still free to add (for "Only N left" hints). */
export function remainingFor(items: CartItem[], productId: string, stockOnHand: number): number {
  return Math.max(0, stockOnHand - baseQtyInCart(items, productId))
}

// ── Undo a removed line ─────────────────────────────────────────────────────

export type RestoreResult = { ok: true; items: CartItem[] } | { ok: false; reason: "exists" | "limit" }

/**
 * Put a just-removed line back where it was (Undo on the "Removed" toast).
 * Refuses when the same line was re-added meanwhile ("exists" — the cashier
 * already fixed it) or when it no longer fits the current stock/allowance
 * `limit` ("limit" — never oversell). Every line of the product gets the
 * fresh limit, same as add().
 */
export function restoreLine(items: CartItem[], line: CartItem, index: number, limit: number): RestoreResult {
  const key = lineKey(line)
  if (items.some((i) => lineKey(i) === key)) return { ok: false, reason: "exists" }
  if (baseQtyInCart(items, line.productId) + line.quantity > limit) return { ok: false, reason: "limit" }
  const at = Math.max(0, Math.min(Math.floor(index), items.length))
  const next = [...items.slice(0, at), line, ...items.slice(at)]
  return { ok: true, items: next.map((i) => (i.productId === line.productId ? { ...i, stockOnHand: limit } : i)) }
}
