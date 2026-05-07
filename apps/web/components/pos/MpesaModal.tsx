"use client"

import { useState, useEffect, useCallback } from "react"
import { Phone, Check, Info, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { formatKES } from "@/lib/store/cartStore"

type Mode = "prompt" | "manual"
type Phase = "input" | "waiting"

interface Props {
  open: boolean
  total: number
  onClose: () => void
  onConfirm: (mpesaRef: string | null) => void
}

const CODE_RE = /^[A-Z0-9]{10}$/i

export function MpesaModal({ open, total, onClose, onConfirm }: Props) {
  const [mode, setMode] = useState<Mode>("prompt")
  const [phase, setPhase] = useState<Phase>("input")
  const [phone, setPhone] = useState("")
  const [code, setCode] = useState("")
  const [timer, setTimer] = useState(60)
  const [sending, setSending] = useState(false)

  const codeValid = CODE_RE.test(code.trim())

  useEffect(() => {
    if (phase !== "waiting") return
    setTimer(60)
    const id = setInterval(() => setTimer((t) => Math.max(0, t - 1)), 1000)
    return () => clearInterval(id)
  }, [phase])

  const reset = useCallback(() => {
    setPhase("input")
    setCode("")
    setTimer(60)
  }, [])

  const switchMode = (m: Mode) => {
    setMode(m)
    reset()
  }

  async function sendSTK() {
    setSending(true)
    try {
      const res = await fetch("/api/mpesa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, amount: total, accountReference: "PHARMATRACK" }),
      })
      const json = (await res.json()) as { error?: string }
      if (json.error) throw new Error(json.error)
      setPhase("waiting")
    } catch {
      switchMode("manual")
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="max-w-[500px] p-0 gap-0 overflow-hidden rounded-2xl max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--pt-border)] sticky top-0 bg-white z-10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[var(--pt-green-50)] flex items-center justify-center font-black text-[var(--pt-green-600)] text-sm tracking-tight">
              M·P
            </div>
            <h2 className="text-lg font-bold">M-Pesa Payment</h2>
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
          {/* Amount */}
          <div className="flex justify-between items-baseline bg-gray-50 border border-[var(--pt-border)] rounded-xl px-4 py-3">
            <span className="text-sm font-medium text-[var(--pt-text-secondary)]">Amount</span>
            <span className="text-2xl font-bold tabular-nums">{formatKES(total)}</span>
          </div>

          {/* Mode toggle */}
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { id: "prompt" as const, label: "Send STK Push", desc: "Auto-prompt customer phone" },
                { id: "manual" as const, label: "Manual Confirm", desc: "Customer already paid" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                onClick={() => switchMode(opt.id)}
                className={`text-left p-3 rounded-xl border transition-colors ${
                  mode === opt.id
                    ? "border-[var(--pt-green)] bg-[var(--pt-green-50)]"
                    : "border-[var(--pt-border)] bg-white hover:bg-gray-50"
                }`}
              >
                <p
                  className={`text-sm font-semibold mb-0.5 ${
                    mode === opt.id ? "text-[var(--pt-green-600)]" : "text-[var(--pt-text)]"
                  }`}
                >
                  {opt.label}
                </p>
                <p className="text-xs text-[var(--pt-text-secondary)]">{opt.desc}</p>
              </button>
            ))}
          </div>

          {/* PROMPT — input */}
          {mode === "prompt" && phase === "input" && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[var(--pt-text-secondary)] uppercase tracking-wide mb-1.5">
                  Customer phone
                </label>
                <div className="flex gap-2">
                  <div className="flex items-center gap-1.5 h-11 px-3 border border-[var(--pt-border)] rounded-xl bg-white text-sm font-medium shrink-0">
                    🇰🇪 +254
                  </div>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="7__ ___ ___"
                    className="flex-1 h-11 px-3 border border-[var(--pt-border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--pt-green)] focus:border-transparent text-sm"
                  />
                </div>
              </div>
              <Button
                onClick={sendSTK}
                disabled={sending || phone.replace(/\D/g, "").length < 9}
                className="w-full h-12 gap-2 bg-[var(--pt-green)] hover:bg-[var(--pt-green-600)] text-white rounded-xl text-base font-semibold"
              >
                <Phone size={18} />
                {sending ? "Sending…" : "Send STK Push"}
              </Button>
            </div>
          )}

          {/* PROMPT — waiting */}
          {mode === "prompt" && phase === "waiting" && (
            <div className="bg-[var(--pt-green-50)] border border-[var(--pt-green-100)] rounded-xl p-5 text-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-[var(--pt-green)] flex items-center justify-center mx-auto font-black text-white text-lg tracking-tight">
                M·P
              </div>
              <div>
                <p className="font-bold">Request sent to +254{phone.replace(/\D/g, "")}</p>
                <p className="text-sm text-[var(--pt-text-secondary)] mt-0.5">
                  Ask customer to enter their M-Pesa PIN
                </p>
              </div>
              <div className="inline-flex items-center gap-2 bg-white rounded-full px-4 py-2 text-sm font-semibold tabular-nums">
                <span className="w-2 h-2 rounded-full bg-[var(--pt-green)] animate-pulse" />
                Waiting · 0:{String(timer).padStart(2, "0")} remaining
              </div>
              <div className="flex gap-2 justify-center flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    reset()
                    sendSTK()
                  }}
                  className="gap-1.5"
                >
                  <RotateCcw size={13} />
                  Resend
                </Button>
                <Button variant="outline" size="sm" onClick={() => switchMode("manual")}>
                  Enter code manually
                </Button>
                <Button
                  size="sm"
                  onClick={() => onConfirm(null)}
                  className="bg-[var(--pt-green)] hover:bg-[var(--pt-green-600)] text-white"
                >
                  Confirm received
                </Button>
              </div>
            </div>
          )}

          {/* MANUAL */}
          {mode === "manual" && (
            <div className="space-y-3">
              <div className="flex gap-2.5 bg-blue-50 border border-blue-100 rounded-xl p-3">
                <Info size={14} className="text-blue-600 mt-0.5 shrink-0" />
                <p className="text-xs text-blue-800 leading-relaxed">
                  Use when the customer paid via <strong>Pay Bill</strong> or{" "}
                  <strong>Send Money</strong> on their own. Read the M-Pesa SMS code aloud —
                  verify it matches the amount before confirming.
                </p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--pt-text-secondary)] uppercase tracking-wide mb-1.5">
                  M-Pesa transaction code
                </label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 10))}
                  placeholder="e.g. RGQ45HTYS8"
                  className="w-full h-11 px-3 border border-[var(--pt-border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--pt-green)] focus:border-transparent font-mono font-semibold tracking-widest uppercase text-sm"
                />
                <div className="flex justify-between mt-1.5 text-xs text-[var(--pt-text-secondary)]">
                  <span>10 characters · letters & numbers</span>
                  <span className={codeValid ? "text-[var(--pt-green-600)] font-semibold" : ""}>
                    {codeValid ? "✓ Valid format" : `${code.length}/10`}
                  </span>
                </div>
              </div>
              <Button
                onClick={() => onConfirm(code.trim())}
                disabled={!codeValid}
                className="w-full h-12 gap-2 bg-[var(--pt-green)] hover:bg-[var(--pt-green-600)] text-white rounded-xl text-base font-semibold"
              >
                <Check size={18} />
                Confirm payment manually
              </Button>
              <button
                onClick={() => switchMode("prompt")}
                className="w-full text-center text-xs text-[var(--pt-green-600)] font-medium hover:underline"
              >
                ← Back to STK push
              </button>
            </div>
          )}

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
