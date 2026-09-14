"use client"

// Self-contained "I've paid" M-Pesa claim box for the SubscriptionGate screen.
// Rendered on the (locked-out) gate path, which sits OUTSIDE <Providers> — so no
// react-query client is available here. Plain fetch/useState only.

import { useEffect, useState } from "react"
import { Loader2, Smartphone, Clock, CheckCircle2 } from "lucide-react"

interface BillingData {
  subscription: { plan: { price_kes: number } | null } | null
  payments: Array<{ id: string; amount_kes: number; reference: string | null; status: string; created_at: string }>
  paymentNumber: string | null
}

export function PaymentClaimBox() {
  const [data, setData] = useState<BillingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [reference, setReference] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [justSubmitted, setJustSubmitted] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch("/api/billing")
      .then((r) => (r.ok ? r.json() : null))
      .then((json: BillingData | null) => { if (!cancelled) setData(json) })
      .catch(() => { if (!cancelled) setData(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  async function submit() {
    if (!reference.trim()) { setError("Enter the M-Pesa confirmation code"); return }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch("/api/billing/claim-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference: reference.trim() }),
      })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(json.error ?? "Could not submit payment")
      setJustSubmitted(true)
      setReference("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error")
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div className="mt-5 flex items-center justify-center gap-2 text-xs text-[var(--pt-text-secondary)]"><Loader2 size={13} className="animate-spin" /> Loading payment details…</div>
  }
  if (!data?.paymentNumber) return null

  const pending = data.payments.find((p) => p.status === "pending")
  const price = data.subscription?.plan?.price_kes

  return (
    <div className="mt-5 text-left bg-[var(--pt-muted)] rounded-xl border border-[var(--pt-border)] p-4">
      <h2 className="text-xs font-bold uppercase tracking-wide text-[var(--pt-text-secondary)] mb-2.5 flex items-center gap-1.5">
        <Smartphone size={13} /> Pay via M-Pesa to reactivate
      </h2>

      {pending || justSubmitted ? (
        <div className="flex items-start gap-2 text-sm">
          <Clock size={16} className="mt-0.5 text-amber-600 dark:text-amber-400 shrink-0" />
          <p className="text-[var(--pt-text-secondary)]">
            {justSubmitted
              ? "Thanks — we'll verify and reactivate your subscription shortly."
              : `Payment awaiting confirmation${pending?.reference ? ` (ref ${pending.reference})` : ""}. We'll reactivate once it's verified.`}
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm text-[var(--pt-text-secondary)]">
            Send {price ? <strong>KES {Number(price).toLocaleString()}</strong> : "your subscription fee"} via M-Pesa to{" "}
            <strong className="tabular-nums">{data.paymentNumber}</strong>, then enter the confirmation code you received.
          </p>
          <div className="mt-3 flex flex-col sm:flex-row gap-2">
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="e.g. QFT7X2ABCD"
              className="flex-1 h-10 px-3 rounded-lg border border-[var(--pt-border)] bg-[var(--pt-surface)] text-sm outline-none focus:ring-2 focus:ring-[var(--pt-green)]"
            />
            <button
              onClick={submit}
              disabled={submitting}
              className="inline-flex items-center justify-center gap-2 px-4 h-10 rounded-lg bg-[var(--pt-green)] text-white text-sm font-semibold hover:bg-[var(--pt-green-600)] transition-colors disabled:opacity-60"
            >
              {submitting ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
              I&apos;ve paid
            </button>
          </div>
          {error && <p className="text-xs text-red-600 dark:text-red-400 mt-2">{error}</p>}
        </>
      )}
    </div>
  )
}
