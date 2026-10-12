"use client"

// "Request a trial extension" for owners whose pharmacy has no trial and hasn't
// paid (e.g. created without one because a previous trial matched). Rendered on
// the SubscriptionGate screen (outside <Providers>, so plain fetch/useState —
// no react-query) and in Settings → Billing. Renders nothing when not eligible.

import { useEffect, useState } from "react"
import { Loader2, MessageSquarePlus, Clock, CheckCircle2 } from "lucide-react"

interface Status {
  eligible: boolean
  noTrialGranted: boolean
  pending: { id: string; created_at: string } | null
  latest: { status: string; decided_at: string | null; days_granted: number | null } | null
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString("en-KE", { timeZone: "Africa/Nairobi", day: "numeric", month: "short", year: "numeric" })

export function TrialExtensionBox({ className = "" }: { className?: string }) {
  const [status, setStatus] = useState<Status | null>(null)
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch("/api/billing/trial-extension")
      .then((r) => (r.ok ? r.json() : null))
      .then((json: Status | null) => { if (!cancelled) setStatus(json) })
      .catch(() => { if (!cancelled) setStatus(null) })
    return () => { cancelled = true }
  }, [])

  // While a request waits, poll so an approval lifts the gate by itself.
  useEffect(() => {
    if (!status?.pending) return
    const timer = setInterval(async () => {
      try {
        const res = await fetch("/api/billing/trial-extension")
        if (!res.ok) return
        const json = (await res.json()) as Status
        setStatus(json)
        if (!json.pending && json.latest?.status === "approved") setTimeout(() => window.location.reload(), 1500)
      } catch { /* offline — next tick */ }
    }, 30_000)
    return () => clearInterval(timer)
  }, [status?.pending])

  async function submit() {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch("/api/billing/trial-extension", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(message.trim() ? { message: message.trim() } : {}),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string; id?: string }
      if (!res.ok) throw new Error(json.error ?? "Could not send your request")
      setStatus((s) => (s ? { ...s, pending: { id: json.id ?? "", created_at: new Date().toISOString() } } : s))
      setOpen(false)
      setMessage("")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send your request")
    } finally {
      setSubmitting(false)
    }
  }

  if (!status) return null

  if (status.latest?.status === "approved" && !status.pending && !status.eligible) {
    return (
      <div className={`rounded-xl border border-[var(--pt-green-100)] bg-[var(--pt-green-50)] p-4 text-sm text-[var(--pt-green-700)] flex gap-2.5 text-left ${className}`}>
        <CheckCircle2 size={18} className="shrink-0 mt-0.5" />
        <span>Your trial request was approved{status.latest.days_granted ? ` — ${status.latest.days_granted} days` : ""}. Enjoy PharmaTrack!</span>
      </div>
    )
  }

  if (status.pending) {
    return (
      <div className={`rounded-xl border border-[var(--pt-border)] bg-[var(--pt-muted)] p-4 text-sm text-[var(--pt-text-secondary)] flex gap-2.5 text-left ${className}`}>
        <Clock size={18} className="shrink-0 mt-0.5" />
        <span>Your trial request (sent {fmt(status.pending.created_at)}) is with the PharmaTrack team. We&apos;ll email you as soon as it&apos;s reviewed.</span>
      </div>
    )
  }

  if (!status.eligible) return null

  return (
    <div className={`rounded-xl border border-[var(--pt-border)] bg-[var(--pt-surface)] p-4 text-left ${className}`}>
      <p className="text-sm font-semibold">Need more time to try PharmaTrack?</p>
      <p className="text-sm text-[var(--pt-text-secondary)] mt-1">
        {status.noTrialGranted
          ? "This pharmacy was set up without a free trial because one has already been used with these details. "
          : ""}
        Ask the PharmaTrack team for a trial extension and we&apos;ll get back to you by email.
      </p>
      {status.latest?.status === "declined" && (
        <p className="text-xs text-[var(--pt-text-tertiary)] mt-1.5">
          Your previous request{status.latest.decided_at ? ` (${fmt(status.latest.decided_at)})` : ""} wasn&apos;t approved — you can still subscribe at any time.
        </p>
      )}

      {open ? (
        <div className="mt-3 space-y-2">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, 1000))}
            rows={3}
            placeholder="Anything we should know? (optional)"
            className="w-full px-3 py-2 rounded-lg border border-[var(--pt-border)] bg-[var(--pt-surface)] text-sm outline-none focus:border-[var(--pt-green)] focus:ring-2 focus:ring-[var(--pt-green)]/20"
          />
          {error && <p className="text-xs text-[var(--pt-red)]">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={submit} disabled={submitting}
              className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg bg-[var(--pt-green)] text-white text-sm font-semibold hover:bg-[var(--pt-green-600)] disabled:opacity-60">
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <MessageSquarePlus size={14} />} Send request
            </button>
            <button type="button" onClick={() => { setOpen(false); setError(null) }}
              className="px-3 h-9 rounded-lg border border-[var(--pt-border)] text-sm font-semibold text-[var(--pt-text-secondary)] hover:bg-[var(--pt-muted)]">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(true)}
          className="mt-3 inline-flex items-center gap-1.5 px-3 h-9 rounded-lg border border-[var(--pt-border)] text-sm font-semibold hover:bg-[var(--pt-muted)]">
          <MessageSquarePlus size={14} /> Request a trial extension
        </button>
      )}
    </div>
  )
}
