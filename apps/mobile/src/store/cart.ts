import { AppState } from "react-native"
import { create } from "zustand"
import { defaultAllows, STAFF_ROLES, toCents, type StaffRole } from "@pharmatrack/core"
import { sqlite } from "../db/database"
import type { ProductRow } from "../db/schema"
import { env } from "../lib/env"
import { createDebouncedWriter } from "../lib/debouncedWriter"
import { kvGetSync, kvSetSync } from "../lib/kv"
import { sellableFor } from "../lib/sync/commit-sale"
import {
  baseQtyInCart, cartTotals, clampDiscount, lineCap, lineKey, restoreLine, unitsPerSell,
  type CartItem, type CartSellUnit, type CartTotals,
} from "../features/pos/logic/cart"
import { useSessionStore } from "./session"
import { staffCan, useStaffStore } from "./staff"

// R2 cart. The line model and every total live in features/pos/logic/cart.ts
// (pure, tested); this store only holds the lines, enforces the caps and
// persists the in-progress cart so a crash or restart mid-sale loses nothing.
//
// Caps (never oversell):
//  - online build: min(this phone's allowance, cached stock) — sellableFor(),
//    the same number commitDeviceSale() re-checks inside its transaction;
//  - Offline Edition: the branch's cached stock_on_hand.
// Actions never toast — they return why they refused, so the POS can first
// ask the server for more allowance (online) and only then tell the cashier.

export type { CartItem, CartSellUnit } from "../features/pos/logic/cart"

const OFFLINE_EDITION = env.EXPO_PUBLIC_OFFLINE_MODE
const KEY = "pos_cart_v2"

/** Outcome of anything that can hit the stock/allowance cap. */
export type CapResult =
  | { ok: true; key: string }
  | {
      ok: false
      reason: "limit"
      productId: string
      productName: string
      /** Base units of the product the cart may still hold in total. */
      limit: number
      /** Base units the cashier asked for in total. */
      wanted: number
    }

export type DiscountResult =
  | { ok: true; applied: number; capped: boolean }
  | { ok: false; reason: "permission" | "missing" }

export interface AddOptions {
  /** Sell a whole pack (pack-size barcode, unit picker). null/undefined = base unit. */
  sellUnit?: CartSellUnit | null
  /** How many sell units to add (default 1). */
  count?: number
}

interface CartState {
  items: CartItem[]
  add: (product: ProductRow, opts?: AddOptions) => CapResult
  /** Quantity in the line's own sell unit (packs or base units). */
  setSellQty: (key: string, qty: number) => CapResult
  /** Switch a line between the base unit and a pack size (merges with an existing line of that unit). */
  setSellUnit: (key: string, sellUnit: CartSellUnit | null) => CapResult
  setLineDiscount: (key: string, percent: number) => DiscountResult
  /** Re-read the caps (after an allowance top-up, a sync, or on POS open). */
  refreshLimits: (productIds?: string[]) => void
  remove: (key: string) => void
  /** Undo a removal: put `line` back at `index` if it still fits (re-checks the cap). */
  restore: (line: CartItem, index: number) => { ok: true } | { ok: false; reason: "exists" | "limit" }
  clear: () => void
  totals: () => CartTotals
}

/** What the till may still sell per product (see the header comment). */
export function currentLimits(productIds: string[]): Map<string, number> {
  if (!OFFLINE_EDITION) return sellableFor(productIds)
  const out = new Map<string, number>()
  for (let i = 0; i < productIds.length; i += 500) {
    const chunk = productIds.slice(i, i + 500)
    const rows = sqlite.getAllSync<{ id: string; stock: number }>(
      `SELECT product_id AS id, stock_on_hand AS stock FROM products WHERE product_id IN (${chunk.map(() => "?").join(",")})`,
      chunk,
    )
    for (const r of rows) out.set(r.id, Math.max(0, r.stock))
  }
  return out
}

/** pos.discount for whoever is selling (Offline Edition: the signed-in role's default). */
export function canGiveDiscount(): boolean {
  if (OFFLINE_EDITION) {
    const role = useSessionStore.getState().role
    return !!role && (STAFF_ROLES as readonly string[]).includes(role) && defaultAllows(role as StaffRole, "pos.discount")
  }
  return staffCan(useStaffStore.getState().current, "pos.discount")
}

export function limitMessage(scope: "stock" | "device", name: string, available: number): string {
  if (scope === "device") return available > 0 ? `Only ${available} of ${name} left on this device` : `${name}: none left on this device`
  return available > 0 ? `Only ${available} of ${name} in stock` : `${name} is out of stock`
}

export const LIMIT_SCOPE: "stock" | "device" = OFFLINE_EDITION ? "stock" : "device"

function newLine(product: ProductRow, limit: number, sellUnit: CartSellUnit | null, quantity: number): CartItem {
  return {
    productId: product.productId,
    productName: product.name,
    productStrength: product.strength,
    quantity,
    unitPrice: toCents(product.sellingPrice),
    discountPercent: 0,
    baseUnit: product.baseUnit,
    isControlled: product.isControlled,
    requiresPrescription: product.requiresPrescription,
    stockOnHand: limit,
    maxDiscountPercent: product.maxDiscountPercent,
    sellUnit,
  }
}

/** Every line of `productId` gets the fresh limit. Same array back when nothing changed (no store update, no re-render). */
const withLimit = (items: CartItem[], productId: string, limit: number) =>
  items.some((i) => i.productId === productId && i.stockOnHand !== limit)
    ? items.map((i) => (i.productId === productId ? { ...i, stockOnHand: limit } : i))
    : items

function refused(items: CartItem[], line: Pick<CartItem, "productId" | "productName">, limit: number, wantedOnLine: number, key: string): CapResult {
  return {
    ok: false,
    reason: "limit",
    productId: line.productId,
    productName: line.productName,
    limit,
    wanted: baseQtyInCart(items, line.productId, key) + wantedOnLine,
  }
}

function loadSaved(): CartItem[] {
  try {
    const saved = kvGetSync<CartItem[]>(KEY)
    if (!Array.isArray(saved)) return []
    // Drop anything a previous app version wrote in another shape.
    return saved.filter(
      (i) => typeof i?.productId === "string" && Number.isInteger(i.quantity) && i.quantity > 0 && "sellUnit" in i && "requiresPrescription" in i,
    )
  } catch {
    return []
  }
}

export const useCartStore = create<CartState>((set, get) => ({
  items: loadSaved(),

  add(product, opts = {}) {
    const sellUnit = opts.sellUnit ?? null
    const count = Math.max(1, Math.floor(opts.count ?? 1))
    const limit = currentLimits([product.productId]).get(product.productId) ?? 0
    const items = withLimit(get().items, product.productId, limit)
    const key = lineKey({ productId: product.productId, sellUnit })
    const existing = items.find((i) => lineKey(i) === key)
    const per = sellUnit?.unitCount ?? 1
    const nextBase = (existing?.quantity ?? 0) + count * per
    if (baseQtyInCart(items, product.productId, key) + nextBase > limit) {
      // Refused: only store the fresher limit if it actually moved.
      if (items !== get().items) set({ items })
      return refused(items, { productId: product.productId, productName: product.name }, limit, nextBase, key)
    }
    set({
      items: existing
        ? items.map((i) => (lineKey(i) === key ? { ...i, quantity: nextBase, maxDiscountPercent: product.maxDiscountPercent } : i))
        : [...items, newLine(product, limit, sellUnit, nextBase)],
    })
    return { ok: true, key }
  },

  setSellQty(key, qty) {
    const items = get().items
    const line = items.find((i) => lineKey(i) === key)
    if (!line) return { ok: true, key }
    const n = Math.max(1, Math.floor(qty))
    if (n > lineCap(items, line)) return refused(items, line, line.stockOnHand, n * unitsPerSell(line), key)
    set({ items: items.map((i) => (lineKey(i) === key ? { ...i, quantity: n * unitsPerSell(i) } : i)) })
    return { ok: true, key }
  },

  setSellUnit(key, sellUnit) {
    const items = get().items
    const line = items.find((i) => lineKey(i) === key)
    if (!line) return { ok: true, key }
    const nextKey = lineKey({ productId: line.productId, sellUnit })
    if (nextKey === key) return { ok: true, key }
    // 2 strips of 10 → 20 tablets; 25 tablets → 2 strips (at least 1).
    const per = sellUnit?.unitCount ?? 1
    const converted = sellUnit ? Math.max(1, Math.floor(line.quantity / per)) * per : line.quantity
    const target = items.find((i) => lineKey(i) === nextKey)
    const rest = items.filter((i) => lineKey(i) !== key && lineKey(i) !== nextKey)
    const others = baseQtyInCart(rest, line.productId)
    const free = line.stockOnHand - others
    let quantity = (target?.quantity ?? 0) + converted
    if (quantity > free) quantity = Math.floor(free / per) * per // keep what fits
    if (quantity <= 0) return refused(items, line, line.stockOnHand, converted, key)
    const merged: CartItem = { ...(target ?? line), sellUnit, quantity, discountPercent: target?.discountPercent ?? line.discountPercent }
    // The merged line takes this line's place in the list.
    const next: CartItem[] = []
    for (const i of items) {
      const k = lineKey(i)
      if (k === key) next.push(merged)
      else if (k !== nextKey) next.push(i)
    }
    set({ items: next })
    return { ok: true, key: nextKey }
  },

  setLineDiscount(key, percent) {
    const line = get().items.find((i) => lineKey(i) === key)
    if (!line) return { ok: false, reason: "missing" }
    if (!canGiveDiscount()) return { ok: false, reason: "permission" }
    const applied = clampDiscount(percent, line.maxDiscountPercent)
    set((s) => ({ items: s.items.map((i) => (lineKey(i) === key ? { ...i, discountPercent: applied } : i)) }))
    return { ok: true, applied, capped: applied < percent }
  },

  refreshLimits(productIds) {
    const ids = productIds ?? [...new Set(get().items.map((i) => i.productId))]
    if (ids.length === 0) return
    const limits = currentLimits(ids)
    const items = get().items
    // Skip the update (and every cart subscriber's re-render) when no limit moved.
    if (!items.some((i) => limits.has(i.productId) && limits.get(i.productId) !== i.stockOnHand)) return
    set({ items: items.map((i) => (limits.has(i.productId) ? { ...i, stockOnHand: limits.get(i.productId)! } : i)) })
  },

  remove(key) {
    set((s) => ({ items: s.items.filter((i) => lineKey(i) !== key) }))
  },

  restore(line, index) {
    const limit = currentLimits([line.productId]).get(line.productId) ?? 0
    const r = restoreLine(get().items, line, index, limit)
    if (!r.ok) return r
    set({ items: r.items })
    return { ok: true }
  },

  clear() {
    set({ items: [] })
  },

  totals() {
    return cartTotals(get().items)
  },
}))

// Persist the cart so a crash or the OS killing the app mid-sale loses
// nothing. Writes are debounced (300 ms trailing) so a scanning burst is one
// SQLite write, not one per scan; the window is closed by:
//  - an EMPTY cart (sale committed / cleared) is written immediately — a
//    restart must never bring back lines that were already sold;
//  - the app leaving the foreground flushes (the OS may kill it there);
//  - the POS flushes right before committing a sale (flushCartPersistence).
const PERSIST_DEBOUNCE_MS = 300

function persist(items: CartItem[]) {
  try {
    kvSetSync(KEY, items)
  } catch {
    // Storage failure must never block selling; the cart stays in memory.
  }
}

const cartWriter = createDebouncedWriter(persist, PERSIST_DEBOUNCE_MS)

useCartStore.subscribe((state, prev) => {
  if (state.items === prev.items) return
  if (state.items.length === 0) cartWriter.writeNow(state.items)
  else cartWriter.schedule(state.items)
})

/** Write any pending cart change now (before a sale commit, on background). */
export function flushCartPersistence(): void {
  cartWriter.flush()
}

AppState.addEventListener("change", (next) => {
  if (next !== "active") cartWriter.flush()
})
