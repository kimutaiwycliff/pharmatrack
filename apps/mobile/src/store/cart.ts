import { Alert } from "react-native"
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
  // Snapshotted from ProductRow.stockOnHand at add-time (the local SQLite
  // catalogue cache — see src/db/schema.ts). Mirrors apps/web/lib/store/cartStore.ts's
  // CartItem.stock_on_hand: caps qty at what's on hand so a cashier can't sell
  // more than the branch actually has, matching web's overselling guard exactly.
  stockOnHand: number
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
      const stock = product.stockOnHand
      const existing = state.items.find((i) => i.productId === product.productId)
      if (existing) {
        if (existing.quantity + 1 > stock) {
          Alert.alert(stock > 0 ? "Limited stock" : "Out of stock", stock > 0 ? `Only ${stock} of ${product.name} in stock` : `${product.name} is out of stock`)
          return state
        }
        return {
          items: state.items.map((i) =>
            i.productId === product.productId ? { ...i, quantity: i.quantity + 1, stockOnHand: stock } : i,
          ),
        }
      }
      if (stock <= 0) {
        Alert.alert("Out of stock", `${product.name} is out of stock`)
        return state
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
        stockOnHand: stock,
      }
      return { items: [...state.items, newItem] }
    })
  },
  incrementQty(productId, delta) {
    set((state) => ({
      items: state.items
        .map((i) => {
          if (i.productId !== productId) return i
          const target = i.quantity + delta
          if (delta > 0 && target > i.stockOnHand) {
            Alert.alert(
              i.stockOnHand > 0 ? "Limited stock" : "Out of stock",
              i.stockOnHand > 0 ? `Only ${i.stockOnHand} of ${i.productName} in stock` : `${i.productName} is out of stock`,
            )
            return i
          }
          return { ...i, quantity: target }
        })
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
