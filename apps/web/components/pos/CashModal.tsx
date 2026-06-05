"use client"

import { useState } from "react"
import { Banknote, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { formatKES } from "@/lib/store/cartStore"

interface Props {
  open: boolean
  total: number
  onClose: () => void
  onConfirm: (amountTendered: number, change: number) => void
}

const QUICK_AMOUNTS = [500, 1000, 2000, 5000]

export function CashModal({ open, total, onClose, onConfirm }: Props) {
  const [tendered, setTendered] = useState<number>(Math.ceil(total / 100) * 100)
  const change = Math.max(0, tendered - total)

  function handleConfirm() {
    if (tendered < total) return
    onConfirm(tendered, change)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="max-w-[480px] p-0 gap-0 overflow-hidden rounded-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--pt-border)]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[var(--pt-green-50)] flex items-center justify-center text-[var(--pt-green-600)]">
              <Banknote size={18} />
            </div>
            <h2 className="text-lg font-bold">Cash Payment</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--pt-muted-strong)] text-[var(--pt-text-secondary)] text-lg"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* Order total */}
          <div className="flex justify-between items-baseline bg-[var(--pt-muted)] border border-[var(--pt-border)] rounded-xl px-4 py-3">
            <span className="text-sm font-medium text-[var(--pt-text-secondary)]">Order total</span>
            <span className="text-2xl font-bold tabular-nums">{formatKES(total)}</span>
          </div>

          {/* Amount tendered */}
          <div>
            <label className="block text-xs font-semibold text-[var(--pt-text-secondary)] uppercase tracking-wide mb-1.5">
              Amount tendered
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-base font-semibold text-[var(--pt-text-secondary)]">
                KSh
              </span>
              <input
                type="number"
                value={tendered}
                onChange={(e) => setTendered(Number(e.target.value) || 0)}
                className="w-full h-14 pl-14 pr-4 text-2xl font-bold tabular-nums border border-[var(--pt-border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--pt-green)] focus:border-transparent"
              />
            </div>
          </div>

          {/* Quick amounts */}
          <div className="grid grid-cols-5 gap-2">
            <button
              onClick={() => setTendered(total)}
              className={`h-11 rounded-lg border font-semibold text-xs transition-colors ${
                tendered === total
                  ? "border-[var(--pt-green)] bg-[var(--pt-green-50)] text-[var(--pt-green-600)]"
                  : "border-[var(--pt-border)] bg-[var(--pt-surface)] text-[var(--pt-text)] hover:bg-[var(--pt-muted)]"
              }`}
            >
              Exact
            </button>
            {QUICK_AMOUNTS.map((amt) => (
              <button
                key={amt}
                onClick={() => setTendered(amt)}
                className={`h-11 rounded-lg border font-semibold text-xs transition-colors ${
                  tendered === amt
                    ? "border-[var(--pt-green)] bg-[var(--pt-green-50)] text-[var(--pt-green-600)]"
                    : "border-[var(--pt-border)] bg-[var(--pt-surface)] text-[var(--pt-text)] hover:bg-[var(--pt-muted)]"
                }`}
              >
                {amt >= 1000 ? `${amt / 1000}k` : amt}
              </button>
            ))}
          </div>

          {/* Change due */}
          <div
            className={`flex justify-between items-baseline rounded-xl px-4 py-3 border ${
              change > 0
                ? "bg-[var(--pt-green-50)] border-[var(--pt-green-100)]"
                : "bg-[var(--pt-muted)] border-[var(--pt-border)]"
            }`}
          >
            <span
              className={`text-sm font-semibold ${
                change > 0 ? "text-[var(--pt-green-600)]" : "text-[var(--pt-text-secondary)]"
              }`}
            >
              Change due
            </span>
            <span
              className={`text-3xl font-bold tabular-nums ${
                change > 0 ? "text-[var(--pt-green-600)]" : "text-[var(--pt-text)]"
              }`}
            >
              {formatKES(change)}
            </span>
          </div>

          <Button
            onClick={handleConfirm}
            disabled={tendered < total}
            className="w-full h-12 text-base font-semibold bg-[var(--pt-green)] hover:bg-[var(--pt-green-600)] text-white rounded-xl gap-2"
          >
            <Check size={18} />
            Confirm sale
          </Button>
          <button
            onClick={onClose}
            className="w-full text-center text-sm text-[var(--pt-text-secondary)] hover:text-[var(--pt-text)]"
          >
            Cancel
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
