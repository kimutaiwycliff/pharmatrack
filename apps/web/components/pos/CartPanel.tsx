"use client"

import { Minus, Plus, Trash2, ShoppingCart } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useCartStore, cartSubtotal, cartTotal, formatKES } from "@/lib/store/cartStore"
import type { CartItem } from "@pharmatrack/types"

type PayModal = "cash" | "mpesa" | "split"

interface Props {
  receiptNumber?: string
  cashierName: string
  onPay: (method: PayModal) => void
  submitting: boolean
}

function QtyControl({ item }: { item: CartItem }) {
  const updateQty = useCartStore((s) => s.updateQty)
  const removeItem = useCartStore((s) => s.removeItem)
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => updateQty(item.product_id, -1)}
        className="w-7 h-7 rounded-md border border-[var(--pt-border)] flex items-center justify-center hover:bg-gray-50 text-[var(--pt-text-secondary)] transition-colors"
      >
        <Minus size={13} />
      </button>
      <span className="w-8 text-center font-semibold text-sm tabular-nums">{item.quantity}</span>
      <button
        onClick={() => updateQty(item.product_id, 1)}
        className="w-7 h-7 rounded-md border border-[var(--pt-border)] flex items-center justify-center hover:bg-gray-50 text-[var(--pt-text-secondary)] transition-colors"
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

export function CartPanel({ receiptNumber, cashierName, onPay, submitting }: Props) {
  const items = useCartStore((s) => s.items)
  const discount = useCartStore((s) => s.discount)
  const setDiscount = useCartStore((s) => s.setDiscount)
  const subtotal = cartSubtotal(items)
  const total = cartTotal(items, discount)
  const hasItems = items.length > 0

  return (
    <div className="flex flex-col h-full border-r border-[var(--pt-border)]">
      {/* Sale header */}
      <div className="px-6 pt-5 pb-4 shrink-0">
        <div className="text-[11px] font-bold text-[var(--pt-green-600)] uppercase tracking-widest mb-1">
          {receiptNumber ? `Sale #${receiptNumber}` : "New Sale"}
        </div>
        <h1 className="text-2xl font-bold tracking-tight">New Sale</h1>
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
      <div className="flex-1 min-h-0 overflow-hidden bg-white rounded-xl border border-[var(--pt-border)] mx-6 flex flex-col">
        {/* Column headers */}
        <div className="grid grid-cols-[1fr_130px_100px_36px] px-5 py-3 text-[11px] font-bold text-[var(--pt-text-secondary)] uppercase tracking-wider border-b border-[var(--pt-border)] bg-gray-50 shrink-0">
          <span>Item</span>
          <span className="text-center">Qty</span>
          <span className="text-right">Subtotal</span>
          <span />
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
              className="grid grid-cols-[1fr_130px_100px_36px] items-center px-5 py-3.5 border-b border-[var(--pt-border)] last:border-b-0"
            >
              <div>
                <p className="text-sm font-semibold leading-tight">{item.product_name}</p>
                <p className="text-xs text-[var(--pt-text-secondary)] mt-0.5">
                  {formatKES(item.unit_price)}/{item.base_unit}
                  {item.product_strength ? ` · ${item.product_strength}` : ""}
                  {item.is_controlled && (
                    <span className="ml-1.5 text-[10px] font-bold text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">
                      CONTROLLED
                    </span>
                  )}
                </p>
              </div>
              <div className="flex justify-center">
                <QtyControl item={item} />
              </div>
              <p className="text-right text-sm font-semibold tabular-nums">{formatKES(item.line_total)}</p>
              <span />
            </div>
          ))}
        </div>

        {/* Totals footer */}
        <div className="px-5 py-4 bg-gray-50 border-t border-[var(--pt-border)] shrink-0 space-y-2">
          <div className="flex justify-between text-sm text-[var(--pt-text-secondary)]">
            <span>Subtotal</span>
            <span className="tabular-nums">{formatKES(subtotal)}</span>
          </div>
          <div className="flex justify-between items-center text-sm text-[var(--pt-text-secondary)]">
            <span>Discount</span>
            <div className="flex items-center gap-1">
              <span className="text-[var(--pt-text-secondary)]">KSh</span>
              <input
                type="number"
                min={0}
                value={discount || ""}
                onChange={(e) => setDiscount(Number(e.target.value) || 0)}
                placeholder="0"
                className="w-24 h-7 px-2 text-right text-sm font-medium border border-[var(--pt-border)] rounded-md focus:outline-none focus:ring-1 focus:ring-[var(--pt-green)] tabular-nums"
              />
            </div>
          </div>
          <div className="flex justify-between items-baseline pt-3 border-t border-dashed border-[var(--pt-border-strong)]">
            <span className="text-sm font-semibold text-[var(--pt-text-secondary)] uppercase tracking-wide">
              Total
            </span>
            <span className="text-3xl font-bold tabular-nums tracking-tight">{formatKES(total)}</span>
          </div>
        </div>
      </div>

      {/* Payment buttons */}
      <div className="px-6 py-4 grid grid-cols-3 gap-2.5 shrink-0">
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
