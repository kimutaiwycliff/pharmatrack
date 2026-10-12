"use client"

// Self-contained "I've paid" M-Pesa claim box for the SubscriptionGate screen.
// Rendered on the (locked-out) gate path, which sits OUTSIDE <Providers> — so no
// react-query client is available here. Plain fetch/useState only.

import { useEffect, useState } from "react"
import { Loader2, Smartphone, Clock, CheckCircle2 } from "lucide-react"

interface BillingData {
  subscription: { effective_status?: string; current_period_end: string | null; plan: { price_kes: number } | null } | null
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

  const [activated, setActivated] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch("/api/billing")
      .then((r) => (r.ok ? r.json() : null))
      .then((json: BillingData | null) => { if (!cancelled) setData(json) })
      .catch(() => { if (!cancelled) setData(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  // While a claim is waiting, poll so the gate lifts by itself the moment the
  // operator confirms — no "please reload" for a locked-out pharmacy.
  const waiting = justSubmitted || !!data?.payments.some((p) => p.status === "pending")
  useEffect(() => {
    if (!waiting || activated) return
    const timer = setInterval(async () => {
      try {
        const res = await fetch("/api/billing")
        if (!res.ok) return
        const json = (await res.json()) as BillingData
        setData(json)
        const s = json.subscription?.effective_status
        if (s === "active" || s === "trialing") {
          setActivated(true)
          setTimeout(() => window.location.reload(), 1500)
        } else if (!json.payments.some((p) => p.status === "pending")) {
          setJustSubmitted(false) // claim was rejected — show the form again
        }
      } catch { /* offline — try again next tick */ }
    }, 15_000)
    return () => clearInterval(timer)
  }, [waiting, activated])

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

  if (activated) {
    return (
      <div className="mt-5 text-left bg-[var(--pt-green-50)] rounded-xl border border-[var(--pt-green-100)] p-4 flex items-start gap-2 text-sm">
        <CheckCircle2 size={16} className="mt-0.5 text-[var(--pt-green-600)] shrink-0" />
        <p>
          <span className="font-semibold">Payment confirmed — welcome back!</span>{" "}
          {data.subscription?.current_period_end
            ? `Active until ${new Date(data.subscription.current_period_end).toLocaleDateString("en-KE", { timeZone: "Africa/Nairobi", day: "numeric", month: "long", year: "numeric" })}. `
            : ""}
          Opening PharmaTrack…
        </p>
      </div>
    )
  }

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
            {" "}This screen opens the app by itself once it&apos;s confirmed.
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
