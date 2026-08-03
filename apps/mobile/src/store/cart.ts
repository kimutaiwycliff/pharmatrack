import { create } from "zustand"
import { applyDiscount, sumCents, toCents, type Cents } from "@pharmatrack/core"
import type { ProductRow } from "../db/schema"

export interface CartItem {
  productId: string
  productName: string
  productStrength: string | null
  quantity: number
  unitPrice: Cents
  discountPercent: number
  baseUnit: string
  isControlled: boolean
}

interface CartState {
  items: CartItem[]
  addProduct: (product: ProductRow) => void
  incrementQty: (productId: string, delta: number) => void
  removeItem: (productId: string) => void
  clear: () => void
  subtotal: () => Cents
  discountTotal: () => Cents
  total: () => Cents
}

function lineDiscount(item: CartItem): Cents {
  const lineSubtotal = item.unitPrice * item.quantity
  return lineSubtotal - applyDiscount(lineSubtotal, item.discountPercent)
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  addProduct(product) {
    set((state) => {
      const existing = state.items.find((i) => i.productId === product.productId)
      if (existing) {
        return {
          items: state.items.map((i) => (i.productId === product.productId ? { ...i, quantity: i.quantity + 1 } : i)),
        }
      }
      const newItem: CartItem = {
        productId: product.productId,
        productName: product.name,
        productStrength: product.strength,
        quantity: 1,
        unitPrice: toCents(product.sellingPrice),
        discountPercent: 0,
        baseUnit: product.baseUnit,
        isControlled: product.isControlled,
      }
      return { items: [...state.items, newItem] }
    })
  },
  incrementQty(productId, delta) {
    set((state) => ({
      items: state.items
        .map((i) => (i.productId === productId ? { ...i, quantity: i.quantity + delta } : i))
        .filter((i) => i.quantity > 0),
    }))
  },
  removeItem(productId) {
    set((state) => ({ items: state.items.filter((i) => i.productId !== productId) }))
  },
  clear() {
    set({ items: [] })
  },
  subtotal() {
    return sumCents(get().items.map((i) => i.unitPrice * i.quantity))
  },
  discountTotal() {
    return sumCents(get().items.map(lineDiscount))
  },
  total() {
    return get().subtotal() - get().discountTotal()
  },
}))
