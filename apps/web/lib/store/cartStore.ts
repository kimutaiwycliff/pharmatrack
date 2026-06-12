"use client"

import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import type { CartItem, ProductWithStock } from "@pharmatrack/types"

interface CartStore {
  items: CartItem[]
  discount: number
  addItem: (product: ProductWithStock) => void
  removeItem: (productId: string) => void
  updateQty: (productId: string, delta: number) => void
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
          const existing = state.items.find((i) => i.product_id === pid)
          if (existing) {
            return {
              items: state.items.map((i) => {
                if (i.product_id !== pid) return i
                const q = i.quantity + 1
                return { ...i, quantity: q, line_total: q * i.unit_price }
              }),
            }
          }
          const price = product.selling_price ?? 0
          const item: CartItem = {
            product_id: pid,
            product_name: product.name ?? "",
            product_strength: product.strength ?? null,
            batch_id: null,
            quantity: 1,
            unit_price: price,
            discount_percent: 0,
            line_total: price,
            base_unit: product.base_unit ?? "unit",
            is_controlled: product.is_controlled ?? false,
            max_discount_percent: product.max_discount_percent ?? null,
          }
          return { items: [...state.items, item] }
        }),

      removeItem: (productId) =>
        set((state) => ({ items: state.items.filter((i) => i.product_id !== productId) })),

      updateQty: (productId, delta) =>
        set((state) => ({
          items: state.items.map((i) => {
            if (i.product_id !== productId) return i
            const q = Math.max(1, i.quantity + delta)
            return { ...i, quantity: q, line_total: q * i.unit_price }
          }),
        })),

      setDiscount: (amount) => set({ discount: Math.max(0, amount) }),

      clearCart: () => set({ items: [], discount: 0 }),
    }),
    {
      name: "pt-cart",
      // Bumped to 1 to discard carts persisted before the product_id fix — a
      // stale item with a bad product_id would otherwise keep failing checkout.
      version: 1,
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
