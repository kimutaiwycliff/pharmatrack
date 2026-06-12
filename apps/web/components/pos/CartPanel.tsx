"use client"

import { Minus, Plus, Trash2, ShoppingCart, AlertTriangle, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useCartStore, cartSubtotal, cartTotal, formatKES } from "@/lib/store/cartStore"
import type { CartItem } from "@pharmatrack/types"

type PayModal = "cash" | "mpesa" | "split"

interface Props {
  receiptNumber?: string
  cashierName: string
  onPay: (method: PayModal) => void
  submitting: boolean
  /** When provided (mobile sheet), shows a collapse handle to dismiss the cart. */
  onClose?: () => void
}

function QtyControl({ item }: { item: CartItem }) {
  const updateQty = useCartStore((s) => s.updateQty)
  const removeItem = useCartStore((s) => s.removeItem)
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => updateQty(item.product_id, -1)}
        className="w-7 h-7 rounded-md border border-[var(--pt-border)] flex items-center justify-center hover:bg-[var(--pt-muted)] text-[var(--pt-text-secondary)] transition-colors"
      >
        <Minus size={13} />
      </button>
      <span className="w-8 text-center font-semibold text-sm tabular-nums">{item.quantity}</span>
      <button
        onClick={() => updateQty(item.product_id, 1)}
        className="w-7 h-7 rounded-md border border-[var(--pt-border)] flex items-center justify-center hover:bg-[var(--pt-muted)] text-[var(--pt-text-secondary)] transition-colors"
      >
        <Plus size={13} />
      </button>
      <button
        onClick={() => removeItem(item.product_id)}
        className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-[var(--pt-red-50)] hover:text-[var(--pt-red)] text-[var(--pt-text-tertiary)] transition-colors ml-1"
        title="Remove"
      >
        <Trash2 size={13} />
      </button>
    </div>
  )
}

export function CartPanel({ receiptNumber, cashierName, onPay, submitting, onClose }: Props) {
  const items = useCartStore((s) => s.items)
  const discount = useCartStore((s) => s.discount)
  const setDiscount = useCartStore((s) => s.setDiscount)
  const subtotal = cartSubtotal(items)
  const total = cartTotal(items, discount)
  const hasItems = items.length > 0

  // Most restrictive product discount cap across all cart items
  const maxAllowedDiscount = (() => {
    const limits = items
      .map(i => i.max_discount_percent)
      .filter((v): v is number => v !== null && v !== undefined)
    if (limits.length === 0) return null
    const minPct = Math.min(...limits)
    return (subtotal * minPct) / 100
  })()
  const discountExceedsLimit = maxAllowedDiscount !== null && discount > maxAllowedDiscount

  return (
    <div className="flex flex-col h-full">
      {/* Mobile grab handle / collapse (sheet only) */}
      {onClose && (
        <button
          onClick={onClose}
          className="md:hidden shrink-0 flex flex-col items-center pt-2.5 pb-1.5 gap-1 text-[var(--pt-text-tertiary)]"
          aria-label="Close cart"
        >
          <span className="w-10 h-1 rounded-full bg-[var(--pt-border-strong)]" />
          <ChevronDown size={16} />
        </button>
      )}

      {/* Sale header */}
      <div className="px-4 sm:px-6 pt-3 sm:pt-5 pb-3 sm:pb-4 shrink-0">
        <div className="text-[11px] font-bold text-[var(--pt-green-600)] uppercase tracking-widest mb-1">
          {receiptNumber ? `Sale #${receiptNumber}` : "New Sale"}
        </div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">New Sale</h1>
        <p className="text-xs text-[var(--pt-text-secondary)] mt-0.5">
          {new Date().toLocaleDateString("en-KE", {
            weekday: "short",
            day: "numeric",
            month: "long",
            year: "numeric",
            timeZone: "Africa/Nairobi",
          })} · Cashier: {cashierName}
        </p>
      </div>

      {/* Cart table */}
      <div className="flex-1 min-h-0 overflow-hidden bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] mx-4 sm:mx-6 flex flex-col">
        {/* Column headers */}
        <div className="grid grid-cols-[1fr_auto_auto] gap-2 sm:gap-3 px-3 sm:px-5 py-3 text-[11px] font-bold text-[var(--pt-text-secondary)] uppercase tracking-wider border-b border-[var(--pt-border)] bg-[var(--pt-muted)] shrink-0">
          <span>Item</span>
          <span className="text-center">Qty</span>
          <span className="text-right">Subtotal</span>
        </div>

        {/* Cart items */}
        <div className="flex-1 overflow-y-auto">
          {!hasItems && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-[var(--pt-text-tertiary)]">
              <ShoppingCart size={36} strokeWidth={1.5} />
              <p className="text-sm">Cart is empty — scan a product to add</p>
            </div>
          )}
          {items.map((item) => (
            <div
              key={item.product_id}
              className="grid grid-cols-[1fr_auto_auto] gap-2 sm:gap-3 items-center px-3 sm:px-5 py-3.5 border-b border-[var(--pt-border)] last:border-b-0"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-tight truncate">{item.product_name}</p>
                <p className="text-xs text-[var(--pt-text-secondary)] mt-0.5 truncate">
                  {formatKES(item.unit_price)}/{item.base_unit}
                  {item.product_strength ? ` · ${item.product_strength}` : ""}
                  {item.is_controlled && (
                    <span className="ml-1.5 text-[10px] font-bold text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-500/15 px-1.5 py-0.5 rounded">
                      CONTROLLED
                    </span>
                  )}
                </p>
              </div>
              <div className="flex justify-center">
                <QtyControl item={item} />
              </div>
              <p className="text-right text-sm font-semibold tabular-nums w-16 sm:w-20">{formatKES(item.line_total)}</p>
            </div>
          ))}
        </div>

        {/* Totals footer */}
        <div className="px-5 py-4 bg-[var(--pt-muted)] border-t border-[var(--pt-border)] shrink-0 space-y-2">
          <div className="flex justify-between text-sm text-[var(--pt-text-secondary)]">
            <span>Subtotal</span>
            <span className="tabular-nums">{formatKES(subtotal)}</span>
          </div>
          <div className="flex justify-between items-center text-sm text-[var(--pt-text-secondary)]">
            <span>
              Discount
              {maxAllowedDiscount !== null && (
                <span className="ml-1 text-[10px] text-[var(--pt-text-tertiary)]">
                  (max {formatKES(maxAllowedDiscount)})
                </span>
              )}
            </span>
            <div className="flex items-center gap-1">
              <span className="text-[var(--pt-text-secondary)]">KSh</span>
              <input
                type="number"
                min={0}
                value={discount || ""}
                onChange={(e) => setDiscount(Number(e.target.value) || 0)}
                placeholder="0"
                className={[
                  "w-24 h-7 px-2 text-right text-sm font-medium border rounded-md focus:outline-none focus:ring-1 tabular-nums",
                  discountExceedsLimit
                    ? "border-[var(--pt-red)] focus:ring-[var(--pt-red)] text-[var(--pt-red)]"
                    : "border-[var(--pt-border)] focus:ring-[var(--pt-green)]",
                ].join(" ")}
              />
            </div>
          </div>
          {discountExceedsLimit && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-red-50 dark:bg-red-500/15 border border-red-200 rounded-lg text-[11px] text-red-700 dark:text-red-300">
              <AlertTriangle size={12} className="shrink-0" />
              Discount exceeds product limit — manager approval required
            </div>
          )}
          <div className="flex justify-between items-baseline pt-3 border-t border-dashed border-[var(--pt-border-strong)]">
            <span className="text-sm font-semibold text-[var(--pt-text-secondary)] uppercase tracking-wide">
              Total
            </span>
            <span className="text-3xl font-bold tabular-nums tracking-tight">{formatKES(total)}</span>
          </div>
        </div>
      </div>

      {/* Payment buttons */}
      <div className="px-4 sm:px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] grid grid-cols-3 gap-2.5 shrink-0">
        <Button
          variant="outline"
          onClick={() => onPay("cash")}
          disabled={!hasItems || submitting}
          className="h-14 flex-col gap-1 text-sm font-bold"
        >
          <span className="text-lg">💵</span>
          CASH
        </Button>
        <Button
          onClick={() => onPay("mpesa")}
          disabled={!hasItems || submitting}
          className="h-14 flex-col gap-1 text-sm font-bold bg-[var(--pt-green)] hover:bg-[var(--pt-green-600)] text-white"
        >
          <span className="font-black text-base tracking-tight">M·P</span>
          M-PESA
        </Button>
        <Button
          variant="outline"
          onClick={() => onPay("split")}
          disabled={!hasItems || submitting}
          className="h-14 flex-col gap-1 text-sm font-bold"
        >
          <span className="text-lg">⚡</span>
          SPLIT
        </Button>
      </div>
    </div>
  )
}
