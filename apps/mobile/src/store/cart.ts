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
  // Snapshotted from ProductRow.maxDiscountPercent at add-time, same pattern
  // as stockOnHand above. Mirrors web's CartItem.max_discount_percent: caps
  // how much discountPercent setDiscountPercent() may apply to this line.
  // null = no product-specific cap (server still enforces its own default).
  maxDiscountPercent: number | null
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
  // Applies one whole-cart discount % request to every line, each clamped by
  // its own maxDiscountPercent — mirrors how the server would clamp per line
  // anyway (apps/web/app/api/sales/route.ts's itemPricing computation).
  setDiscountPercent: (percent: number) => void
  // Most restrictive cap across current cart items, mirroring web's
  // CartPanel.tsx maxAllowedDiscount Math.min(...limits) logic. null means no
  // cap applies (empty cart, or every item has maxDiscountPercent === null).
  maxAllowedDiscountPercent: () => number | null
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
            i.productId === product.productId
              ? { ...i, quantity: i.quantity + 1, stockOnHand: stock, maxDiscountPercent: product.maxDiscountPercent }
              : i,
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
        maxDiscountPercent: product.maxDiscountPercent,
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
  setDiscountPercent(percent) {
    set((state) => ({
      items: state.items.map((i) => ({
        ...i,
        discountPercent: Math.max(0, Math.min(percent, i.maxDiscountPercent ?? 100)),
      })),
    }))
  },
  maxAllowedDiscountPercent() {
    const limits = get()
      .items.map((i) => i.maxDiscountPercent)
      .filter((v): v is number => v !== null && v !== undefined)
    if (limits.length === 0) return null
    return Math.min(...limits)
  },
}))
