"use client"

import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import { toast } from "sonner"
import type { CartItem, CartSellUnit, ProductWithStock } from "@pharmatrack/types"

/** Base units per one of the line's sell units (1 when selling the base unit). */
export const unitsPerSell = (i: Pick<CartItem, "sell_unit">) => i.sell_unit?.unit_count ?? 1
/** Quantity in the unit the cashier is selling in (packs, or base units). */
export const sellQty = (i: Pick<CartItem, "quantity" | "sell_unit">) => i.quantity / unitsPerSell(i)
/** Price of one sell unit. */
export const sellPrice = (i: Pick<CartItem, "unit_price" | "sell_unit">) => i.sell_unit?.price ?? i.unit_price
const withTotal = (i: CartItem): CartItem => ({ ...i, line_total: Math.round(sellQty(i) * sellPrice(i) * 100) / 100 })
const unitName = (i: CartItem) => i.sell_unit?.label ?? i.base_unit


interface CartStore {
  items: CartItem[]
  discount: number
  addItem: (product: ProductWithStock) => void
  removeItem: (productId: string) => void
  /** Change quantity by `delta` sell units (packs when a pack is selected). */
  updateQty: (productId: string, delta: number) => void
  /** Set an exact quantity in sell units (typed by the cashier). */
  setQty: (productId: string, sellUnits: number) => void
  /** Switch the line between the base unit and a pack size; keeps 1 sell unit. */
  setSellUnit: (productId: string, unit: CartSellUnit | null) => void
  setDiscount: (amount: number) => void
  clearCart: () => void
}

export const useCartStore = create<CartStore>()(
  persist(
    (set) => ({
      items: [],
      discount: 0,

      addItem: (product) =>
        set((state) => {
          // Sources are inconsistent: the product_stock view returns
          // `product_id`, the raw products table returns `id`. Accept either so
          // a scanned/just-created product can never enter the cart without a
          // usable id (which would fail UUID validation at checkout).
          // `||` (not `??`) so an empty-string product_id also falls back —
          // "" is what fails UUID validation at checkout.
          const pid = product.product_id || (product as { id?: string }).id
          if (!pid) return state
          // Cap the cart at on-hand stock — never sell more than we have.
          const stock = Number(product.stock_on_hand ?? 0)
          const name = product.name ?? "Item"
          const existing = state.items.find((i) => i.product_id === pid)
          if (existing) {
            const step = unitsPerSell(existing)
            if (existing.quantity + step > stock) {
              toast.error(stock > 0 ? `Only ${stock} ${existing.base_unit}s of ${name} in stock` : `${name} is out of stock`)
              return state
            }
            return {
              items: state.items.map((i) =>
                i.product_id !== pid ? i : withTotal({ ...i, quantity: i.quantity + step, stock_on_hand: stock })),
            }
          }
          if (stock <= 0) {
            toast.error(`${name} is out of stock`)
            return state
          }
          const price = product.selling_price ?? 0
          const item: CartItem = {
            product_id: pid,
            product_name: name,
            product_strength: product.strength ?? null,
            batch_id: null,
            quantity: 1,
            unit_price: price,
            discount_percent: 0,
            line_total: price,
            base_unit: product.base_unit ?? "unit",
            is_controlled: product.is_controlled ?? false,
            max_discount_percent: product.max_discount_percent ?? null,
            stock_on_hand: stock,
          }
          return { items: [...state.items, item] }
        }),

      removeItem: (productId) =>
        set((state) => ({ items: state.items.filter((i) => i.product_id !== productId) })),

      updateQty: (productId, delta) =>
        set((state) => ({
          items: state.items.map((i) => {
            if (i.product_id !== productId) return i
            const step = unitsPerSell(i)
            const target = i.quantity + delta * step
            if (delta > 0 && target > i.stock_on_hand) {
              toast.error(i.stock_on_hand > 0 ? `Only ${i.stock_on_hand} ${i.base_unit}s of ${i.product_name} in stock` : `${i.product_name} is out of stock`)
              return i
            }
            return withTotal({ ...i, quantity: Math.max(step, target) })
          }),
        })),

      setQty: (productId, sellUnits) =>
        set((state) => ({
          items: state.items.map((i) => {
            if (i.product_id !== productId) return i
            const step = unitsPerSell(i)
            const wanted = Math.max(1, Math.floor(sellUnits))
            const maxSell = Math.floor(i.stock_on_hand / step)
            if (wanted > maxSell) {
              toast.error(`Only ${maxSell} ${unitName(i)}${maxSell === 1 ? "" : "s"} of ${i.product_name} in stock`)
              return maxSell > 0 ? withTotal({ ...i, quantity: maxSell * step }) : i
            }
            return withTotal({ ...i, quantity: wanted * step })
          }),
        })),

      setSellUnit: (productId, unit) =>
        set((state) => ({
          items: state.items.map((i) => {
            if (i.product_id !== productId) return i
            const step = unit?.unit_count ?? 1
            if (step > i.stock_on_hand) {
              toast.error(`Not enough stock for a full ${unit?.label ?? i.base_unit} (${i.stock_on_hand} ${i.base_unit}s left)`)
              return i
            }
            return withTotal({ ...i, sell_unit: unit, quantity: step })
          }),
        })),

      setDiscount: (amount) => set({ discount: Math.max(0, amount) }),

      clearCart: () => set({ items: [], discount: 0 }),
    }),
    {
      name: "pt-cart",
      // Bumped to 2 so carts persisted before `stock_on_hand` existed are
      // discarded (v1 = product_id fix; v0 = pre-id).
      version: 2,
      storage: createJSONStorage(() => {
        if (typeof window === "undefined") return localStorage
        return sessionStorage
      }),
    },
  ),
)

export const cartSubtotal = (items: CartItem[]) =>
  items.reduce((sum, i) => sum + i.line_total, 0)

export const cartTotal = (items: CartItem[], discount: number) =>
  Math.max(0, cartSubtotal(items) - discount)

export const formatKES = (amount: number) =>
  new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    minimumFractionDigits: 2,
  }).format(amount)
