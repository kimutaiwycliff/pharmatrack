"use client"

import { useState, useCallback } from "react"
import { Phone, Check, Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { formatKES } from "@/lib/store/cartStore"
import { StkWaitPanel } from "./StkWaitPanel"

type Mode = "prompt" | "manual"
type Phase = "input" | "waiting"

interface Props {
  open: boolean
  total: number
  /** When offline, STK push can't reach the server — force manual confirm. */
  online?: boolean
  /** Whether STK push is available (plan includes it + tenant configured M-Pesa). */
  stkAvailable?: boolean
  /** The sale is being saved — confirm stays off so it can't be sent twice. */
  submitting?: boolean
  onClose: () => void
  /** viaPrompt + checkoutRequestId: M-Pesa confirmed the STK payment (the sale API checks it again).
   *  Otherwise a manual confirmation — recorded as unverified. */
  onConfirm: (mpesaRef: string | null, how: { viaPrompt: boolean; checkoutRequestId?: string }) => void
}

const CODE_RE = /^[A-Z0-9]{10}$/i

export function MpesaModal({ open, total, online = true, stkAvailable = true, submitting = false, onClose, onConfirm }: Props) {
  const [modeChoice, setModeChoice] = useState<Mode>(stkAvailable ? "prompt" : "manual")
  const [phase, setPhase] = useState<Phase>("input")
  const [phone, setPhone] = useState("")
  const [code, setCode] = useState("")
  // The push in flight (Daraja's CheckoutRequestID) — the wait panel polls it.
  const [checkoutId, setCheckoutId] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [stkError, setStkError] = useState<string | null>(null)

  // STK push needs a connection AND an active, plan-enabled M-Pesa config.
  const canPrompt = online && stkAvailable
  // Derive the effective mode: when STK isn't available, always confirm manually
  // (no effect + setState needed — this can't drift out of sync).
  const mode: Mode = canPrompt ? modeChoice : "manual"

  const trimmedCode = code.trim()
  // The code is OPTIONAL (customer already confirmed on their phone). Only block
  // confirmation if something was typed but isn't a valid 10-char M-Pesa code.
  const codeValid = CODE_RE.test(trimmedCode)
  const codeBlocks = trimmedCode.length > 0 && !codeValid

  const reset = useCallback(() => {
    setPhase("input")
    setCode("")
    setCheckoutId(null)
  }, [])

  const onPaid = useCallback((receipt: string | null) => {
    if (checkoutId) onConfirm(receipt, { viaPrompt: true, checkoutRequestId: checkoutId })
  }, [checkoutId, onConfirm])

  const switchMode = (m: Mode) => {
    setModeChoice(m)
    reset()
  }

  async function sendSTK() {
    setSending(true)
    setStkError(null)
    try {
      const res = await fetch("/api/mpesa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, amount: total, accountReference: "PHARMATRACK" }),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string; checkoutRequestId?: string }
      if (!res.ok || json.error || !json.checkoutRequestId) throw new Error(json.error ?? "M-Pesa didn't accept the request")
      setCheckoutId(json.checkoutRequestId)
      setPhase("waiting")
    } catch (err) {
      // Say why, then fall back — the customer can still pay by Pay Bill.
      setStkError(err instanceof TypeError ? "No connection — the prompt wasn't sent." : `The prompt wasn't sent: ${err instanceof Error ? err.message : "unknown error"}.`)
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
        <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--pt-border)] sticky top-0 bg-[var(--pt-surface)] z-10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[var(--pt-green-50)] flex items-center justify-center font-black text-[var(--pt-green-600)] text-sm tracking-tight">
              M·P
            </div>
            <h2 className="text-lg font-bold">M-Pesa Payment</h2>
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
          {/* Amount */}
          <div className="flex justify-between items-baseline bg-[var(--pt-muted)] border border-[var(--pt-border)] rounded-xl px-4 py-3">
            <span className="text-sm font-medium text-[var(--pt-text-secondary)]">Amount</span>
            <span className="text-2xl font-bold tabular-nums">{formatKES(total)}</span>
          </div>

          {/* Mode toggle — only shown when STK push is actually available; otherwise
              the modal goes straight to manual confirm for a cleaner till flow. */}
          {canPrompt && (
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { id: "prompt" as const, label: "Send STK Push", desc: "Auto-prompt customer phone" },
                { id: "manual" as const, label: "Manual Confirm", desc: "Customer already paid" },
              ] as const
            ).map((opt) => {
              return (
                <button
                  key={opt.id}
                  onClick={() => switchMode(opt.id)}
                  className={`text-left p-3 rounded-xl border transition-colors ${
                    mode === opt.id
                      ? "border-[var(--pt-green)] bg-[var(--pt-green-50)]"
                      : "border-[var(--pt-border)] bg-[var(--pt-surface)] hover:bg-[var(--pt-muted)]"
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
              )
            })}
          </div>
          )}

          {/* PROMPT — input */}
          {mode === "prompt" && phase === "input" && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[var(--pt-text-secondary)] uppercase tracking-wide mb-1.5">
                  Customer phone
                </label>
                <div className="flex gap-2">
                  <div className="flex items-center gap-1.5 h-11 px-3 border border-[var(--pt-border)] rounded-xl bg-[var(--pt-surface)] text-sm font-medium shrink-0">
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

          {/* PROMPT — waiting for M-Pesa to confirm; the sale completes by itself */}
          {mode === "prompt" && phase === "waiting" && checkoutId && (
            <StkWaitPanel
              key={checkoutId}
              checkoutRequestId={checkoutId}
              phone={phone}
              amount={Math.ceil(total)}
              submitting={submitting}
              onPaid={onPaid}
              onResend={() => { reset(); void sendSTK() }}
              onManual={() => switchMode("manual")}
            />
          )}

          {/* MANUAL */}
          {mode === "manual" && (
            <div className="space-y-3">
              {stkError && (
                <p role="alert" className="text-sm font-medium text-[var(--pt-red)] bg-[var(--pt-red-50)] rounded-xl px-3 py-2">
                  {stkError} Ask the customer to pay by Pay Bill, then confirm below.
                </p>
              )}
              <div className="flex gap-2.5 bg-blue-50 dark:bg-blue-500/15 border border-blue-100 dark:border-blue-500/30 rounded-xl p-3">
                <Info size={14} className="text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                <p className="text-xs text-blue-800 dark:text-blue-200 leading-relaxed">
                  Use when the customer paid via <strong>Pay Bill</strong> or{" "}
                  <strong>Send Money</strong> on their own.{" "}
                  {online
                    ? "The code is optional — confirm once you've seen the payment."
                    : "You're offline — confirm the customer's M-Pesa now; it syncs later."}
                </p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--pt-text-secondary)] uppercase tracking-wide mb-1.5">
                  M-Pesa transaction code <span className="font-normal normal-case text-[var(--pt-text-tertiary)]">(optional)</span>
                </label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 10))}
                  placeholder="e.g. RGQ45HTYS8"
                  className="w-full h-11 px-3 border border-[var(--pt-border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--pt-green)] focus:border-transparent font-mono font-semibold tracking-widest uppercase text-sm"
                />
                <div className="flex justify-between mt-1.5 text-xs text-[var(--pt-text-secondary)]">
                  <span>Leave blank if the customer already confirmed</span>
                  <span className={codeBlocks ? "text-amber-600 font-semibold" : codeValid ? "text-[var(--pt-green-600)] font-semibold" : ""}>
                    {codeBlocks ? "Must be 10 characters" : codeValid ? "✓ Valid format" : trimmedCode ? `${trimmedCode.length}/10` : ""}
                  </span>
                </div>
              </div>
              <Button
                onClick={() => onConfirm(trimmedCode || null, { viaPrompt: false })}
                disabled={codeBlocks || submitting}
                className="w-full h-12 gap-2 bg-[var(--pt-green)] hover:bg-[var(--pt-green-600)] text-white rounded-xl text-base font-semibold"
              >
                <Check size={18} />
                {submitting ? "Saving…" : trimmedCode ? "Confirm payment" : "Confirm — customer paid"}
              </Button>
              {canPrompt && (
                <button
                  onClick={() => { setStkError(null); switchMode("prompt") }}
                  className="w-full text-center text-xs text-[var(--pt-green-600)] font-medium hover:underline"
                >
                  ← Back to STK push
                </button>
              )}
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
