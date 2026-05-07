"use client"

import { useState } from "react"
import { Banknote, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { formatKES } from "@/lib/store/cartStore"

type MpesaMode = "prompt" | "manual"

interface Props {
  open: boolean
  total: number
  onClose: () => void
  onConfirm: (cashAmt: number, mpesaAmt: number, mpesaRef: string | null) => void
}

const CODE_RE = /^[A-Z0-9]{10}$/i

export function SplitModal({ open, total, onClose, onConfirm }: Props) {
  const [cash, setCash] = useState(() => Math.round(total * 0.4))
  const [phone, setPhone] = useState("")
  const [mpesaMode, setMpesaMode] = useState<MpesaMode>("prompt")
  const [code, setCode] = useState("")
  const [sending, setSending] = useState(false)

  const mpesa = Math.max(0, total - cash)
  const cashPct = total > 0 ? Math.min(100, (cash / total) * 100) : 0
  const mpesaPct = total > 0 ? Math.min(100, (mpesa / total) * 100) : 0
  const codeValid = CODE_RE.test(code.trim())
  const balanced = Math.abs(cash + mpesa - total) < 0.01
  const canConfirm = cash > 0 && mpesa > 0 && balanced && (mpesaMode === "prompt" || codeValid)

  const setCashSafe = (v: number) => setCash(Math.min(total, Math.max(0, v)))

  async function handleConfirm() {
    if (mpesaMode === "manual") {
      onConfirm(cash, mpesa, code.trim())
      return
    }
    setSending(true)
    try {
      await fetch("/api/mpesa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, amount: mpesa, accountReference: "PHARMATRACK" }),
      })
    } catch {}
    setSending(false)
    onConfirm(cash, mpesa, null)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="max-w-[520px] p-0 gap-0 overflow-hidden rounded-2xl max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--pt-border)] sticky top-0 bg-white z-10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[var(--pt-green-50)] flex items-center justify-center text-[var(--pt-green-600)]">
              <Banknote size={17} />
            </div>
            <div>
              <h2 className="text-lg font-bold">Split Payment</h2>
              <p className="text-xs text-[var(--pt-text-secondary)]">
                Combine Cash + M-Pesa for one sale
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 text-[var(--pt-text-secondary)] text-lg"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* Total + allocation bar */}
          <div className="bg-gray-50 border border-[var(--pt-border)] rounded-xl p-4">
            <div className="flex justify-between items-baseline mb-3">
              <span className="text-sm font-medium text-[var(--pt-text-secondary)]">Order total</span>
              <span className="text-2xl font-bold tabular-nums">{formatKES(total)}</span>
            </div>
            <div className="h-2 rounded-full bg-[var(--pt-border)] overflow-hidden flex">
              <div
                style={{ width: `${cashPct}%` }}
                className="bg-gray-400 transition-all duration-150"
              />
              <div
                style={{ width: `${mpesaPct}%` }}
                className="bg-[var(--pt-green)] transition-all duration-150"
              />
            </div>
            <div className="flex justify-between mt-2 text-xs text-[var(--pt-text-secondary)]">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm bg-gray-400" />
                Cash · {cashPct.toFixed(0)}%
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm bg-[var(--pt-green)]" />
                M-Pesa · {mpesaPct.toFixed(0)}%
              </span>
            </div>
          </div>

          {/* Cash portion */}
          <div className="border border-[var(--pt-border)] rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-md bg-gray-100 flex items-center justify-center text-[var(--pt-text-secondary)]">
                <Banknote size={14} />
              </div>
              <span className="text-sm font-semibold">Cash portion</span>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-[var(--pt-text-secondary)]">
                KSh
              </span>
              <input
                type="number"
                value={cash}
                onChange={(e) => setCashSafe(Number(e.target.value) || 0)}
                className="w-full h-10 pl-12 pr-3 border border-[var(--pt-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--pt-green)] focus:border-transparent font-semibold tabular-nums text-sm"
              />
            </div>
            <div className="flex gap-1.5">
              {[0, 25, 50, 75, 100].map((p) => (
                <button
                  key={p}
                  onClick={() => setCashSafe(Math.round((total * p) / 100))}
                  className="flex-1 h-7 border border-[var(--pt-border)] rounded-md bg-white text-xs font-semibold text-[var(--pt-text-secondary)] hover:bg-gray-50 transition-colors"
                >
                  {p}%
                </button>
              ))}
            </div>
          </div>

          {/* M-Pesa portion */}
          <div className="border border-[var(--pt-green-100)] rounded-xl p-4 bg-[var(--pt-green-50)] space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-md bg-[var(--pt-green)] flex items-center justify-center font-black text-white text-[10px] tracking-tight">
                  M·P
                </div>
                <span className="text-sm font-semibold">M-Pesa portion</span>
              </div>
              <span className="text-base font-bold tabular-nums text-[var(--pt-green-600)]">
                {formatKES(mpesa)}
              </span>
            </div>

            <div className="flex gap-1.5 bg-white rounded-lg p-1">
              {(["prompt", "manual"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMpesaMode(m)}
                  className={`flex-1 h-7 rounded-md text-xs font-semibold transition-colors ${
                    mpesaMode === m
                      ? "bg-[var(--pt-green)] text-white"
                      : "text-[var(--pt-text-secondary)] hover:bg-gray-50"
                  }`}
                >
                  {m === "prompt" ? "STK Push" : "Manual Confirm"}
                </button>
              ))}
            </div>

            {mpesaMode === "prompt" ? (
              <div className="flex gap-2">
                <div className="flex items-center gap-1 h-10 px-3 border border-[var(--pt-border)] rounded-lg bg-white text-sm font-medium shrink-0">
                  🇰🇪 +254
                </div>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="7__ ___ ___"
                  className="flex-1 h-10 px-3 border border-[var(--pt-border)] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[var(--pt-green)] focus:border-transparent text-sm"
                />
              </div>
            ) : (
              <div>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 10))}
                  placeholder="M-Pesa code (e.g. RGQ45HTYS8)"
                  className="w-full h-10 px-3 border border-[var(--pt-border)] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[var(--pt-green)] focus:border-transparent font-mono font-semibold tracking-widest uppercase text-sm"
                />
                <div className="flex justify-between mt-1 text-xs text-[var(--pt-text-secondary)]">
                  <span>Customer paid {formatKES(mpesa)} via Pay Bill / Send Money</span>
                  <span className={codeValid ? "text-[var(--pt-green-600)] font-semibold" : ""}>
                    {codeValid ? "✓ Valid" : `${code.length}/10`}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Balance summary */}
          <div className="flex justify-between items-center rounded-xl bg-gray-50 px-4 py-3">
            <span
              className={`text-xs font-semibold ${
                balanced ? "text-[var(--pt-green-600)]" : "text-[var(--pt-text-secondary)]"
              }`}
            >
              {balanced ? "Allocation balanced ✓" : `Remaining: ${formatKES(total - cash - mpesa)}`}
            </span>
            <span className="text-xs tabular-nums text-[var(--pt-text-secondary)]">
              Cash {formatKES(cash)} + M-Pesa {formatKES(mpesa)}
            </span>
          </div>

          <Button
            onClick={handleConfirm}
            disabled={!canConfirm || sending}
            className="w-full h-12 gap-2 bg-[var(--pt-green)] hover:bg-[var(--pt-green-600)] text-white rounded-xl text-base font-semibold"
          >
            <Check size={18} />
            {mpesaMode === "prompt"
              ? "Take cash & send STK push"
              : "Take cash & confirm M-Pesa code"}
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
