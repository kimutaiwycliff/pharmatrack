"use client"

import { useState } from "react"
import Link from "next/link"
import { Loader2, LogIn, CreditCard, MessageSquarePlus, Sparkles } from "lucide-react"

// Shown by SignupForm / OnboardingForm when the API reports that a previous
// trial matches this person (code: "prior_trial"). Friendly and factual: the
// three ways forward are sign in, subscribe (create the account without a
// trial) or ask the PharmaTrack team for a trial extension.

export type SignupIntent = "subscribe" | "request_extension"

export interface PriorTrialInfo {
  pharmacy: string | null
  trial_ended_at: string | null
  matched_on: string[]
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString("en-KE", { timeZone: "Africa/Nairobi", day: "numeric", month: "short", year: "numeric" })

function describe(prior: PriorTrialInfo): string {
  const by = prior.matched_on.includes("email")
    ? "this email"
    : prior.matched_on.includes("google")
      ? "this Google account"
      : prior.matched_on.includes("registration_number")
        ? "this pharmacy registration number"
        : "these details"
  const bits: string[] = []
  if (prior.pharmacy) bits.push(prior.pharmacy)
  if (prior.trial_ended_at) {
    const ended = new Date(prior.trial_ended_at).getTime() <= Date.now()
    bits.push(`trial ${ended ? "ended" : "ends"} ${fmt(prior.trial_ended_at)}`)
  }
  return `Looks like you've already tried PharmaTrack with ${by}${bits.length ? ` (${bits.join(", ")})` : ""}.`
}

export function PriorTrialPanel({
  prior, pending, onChoose, showSignIn = true,
}: {
  prior: PriorTrialInfo
  pending: boolean
  onChoose: (intent: SignupIntent, message?: string) => void
  showSignIn?: boolean
}) {
  const [asking, setAsking] = useState(false)
  const [message, setMessage] = useState("")

  return (
    <div className="rounded-xl border border-[var(--pt-border)] bg-[var(--pt-surface)] p-4 space-y-3">
      <div className="flex gap-2.5">
        <Sparkles size={18} className="shrink-0 mt-0.5 text-[var(--pt-green-700)]" />
        <div className="text-sm">
          <p className="font-semibold text-[var(--pt-text)]">Welcome back!</p>
          <p className="text-[var(--pt-text-secondary)] mt-0.5">{describe(prior)}</p>
          <p className="text-[var(--pt-text-secondary)] mt-1.5">
            Free trials are one per pharmacy. You can sign in to your existing account, or set up this
            pharmacy and subscribe — and if you need more time to evaluate, just ask us.
          </p>
        </div>
      </div>

      {!asking ? (
        <div className="grid gap-2">
          {showSignIn && (
            <Link href="/login" className="h-11 rounded-xl border border-[var(--pt-border)] text-sm font-semibold inline-flex items-center justify-center gap-2 hover:bg-[var(--pt-muted)] transition-colors">
              <LogIn size={16} /> Sign in
            </Link>
          )}
          <button type="button" disabled={pending} onClick={() => onChoose("subscribe")}
            className="h-11 rounded-xl bg-[var(--pt-green)] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 hover:bg-[var(--pt-green-600)] transition-colors disabled:opacity-60">
            {pending ? <Loader2 size={16} className="animate-spin" /> : <CreditCard size={16} />} Subscribe
          </button>
          <button type="button" disabled={pending} onClick={() => setAsking(true)}
            className="h-11 rounded-xl border border-[var(--pt-border)] text-sm font-semibold inline-flex items-center justify-center gap-2 hover:bg-[var(--pt-muted)] transition-colors disabled:opacity-60">
            <MessageSquarePlus size={16} /> Request a trial extension
          </button>
          <p className="text-xs text-[var(--pt-text-tertiary)] text-center">
            Subscribe creates your account without a trial and takes you to payment.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <label className="block">
            <span className="text-sm font-medium text-[var(--pt-text-secondary)]">Tell us a little about why (optional)</span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, 1000))}
              rows={3}
              placeholder="e.g. We're opening a new branch and want to test the POS with our team"
              className="mt-1.5 w-full px-3.5 py-2.5 rounded-xl border border-[var(--pt-border)] bg-[var(--pt-surface)] text-sm text-[var(--pt-text)] outline-none focus:border-[var(--pt-green)] focus:ring-2 focus:ring-[var(--pt-green)]/20"
            />
          </label>
          <button type="button" disabled={pending} onClick={() => onChoose("request_extension", message)}
            className="w-full h-11 rounded-xl bg-[var(--pt-green)] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 hover:bg-[var(--pt-green-600)] transition-colors disabled:opacity-60">
            {pending ? <Loader2 size={16} className="animate-spin" /> : <MessageSquarePlus size={16} />} Create account &amp; send request
          </button>
          <p className="text-xs text-[var(--pt-text-tertiary)] text-center">
            We&apos;ll create your account now and email you once the PharmaTrack team has reviewed your request.
          </p>
          <button type="button" onClick={() => setAsking(false)} className="w-full text-sm text-[var(--pt-text-secondary)] hover:text-[var(--pt-text)]">
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}
