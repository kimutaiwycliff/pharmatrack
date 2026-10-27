"use client"

import { useState } from "react"
import { Loader2, ArrowRight, ArrowLeft } from "lucide-react"
import { trialDaysForSignup } from "@/lib/launch-offer"
import { PriorTrialPanel, type PriorTrialInfo, type SignupIntent } from "@/components/marketing/PriorTrialPanel"

const inputCls = "mt-1.5 w-full h-11 px-3.5 rounded-xl border border-[var(--pt-border)] bg-[var(--pt-surface)] text-[var(--pt-text)] outline-none focus:border-[var(--pt-green)] focus:ring-2 focus:ring-[var(--pt-green)]/20"

export function OnboardingForm() {
  const trialDays = trialDaysForSignup()
  const [name, setName] = useState("")
  const [regNo, setRegNo] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [prior, setPrior] = useState<PriorTrialInfo | null>(null)
  const [pending, setPending] = useState(false)

  async function submit(intent?: SignupIntent, extensionMessage?: string) {
    setError(null)
    setPending(true)
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pharmacy_name: name,
          registration_number: regNo.trim() || undefined,
          ...(intent ? { intent } : {}),
          ...(intent === "request_extension" && extensionMessage?.trim() ? { extension_message: extensionMessage.trim() } : {}),
        }),
      })
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; code?: string; priorTrial?: PriorTrialInfo | null }
      if (res.status === 409 && json.code === "prior_trial") {
        setPrior(json.priorTrial ?? { pharmacy: null, trial_ended_at: null, matched_on: ["email"] })
        setPending(false)
        return
      }
      if (!res.ok) { setError(json.error ?? "Something went wrong"); setPending(false); return }
      window.location.href = "/home?welcome=1"
    } catch {
      setError("Network error — please try again")
      setPending(false)
    }
  }

  if (prior) {
    return (
      <div className="space-y-4">
        {/* Already signed in — "Sign in" makes no sense here. */}
        <PriorTrialPanel prior={prior} pending={pending} onChoose={submit} showSignIn={false} />
        {error && <p className="text-sm text-[var(--pt-red)] bg-[var(--pt-red-50)] rounded-lg px-3 py-2">{error}</p>}
        <button type="button" onClick={() => { setPrior(null); setError(null) }} className="inline-flex items-center gap-1 text-sm text-[var(--pt-text-secondary)] hover:text-[var(--pt-text)]">
          <ArrowLeft size={14} /> Back
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); void submit() }} className="space-y-4">
      <label className="block">
        <span className="text-sm font-medium text-[var(--pt-text-secondary)]">Pharmacy name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required autoFocus placeholder="e.g. Westlands Chemist"
          className={inputCls}
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-[var(--pt-text-secondary)]">
          Pharmacy registration (PPB licence) number
          <span className="ml-1.5 text-xs font-normal text-[var(--pt-text-tertiary)]">(Optional)</span>
        </span>
        <input
          value={regNo}
          onChange={(e) => setRegNo(e.target.value)}
          maxLength={60} placeholder="e.g. PPB/RET/1234/24"
          className={inputCls}
        />
      </label>

      {error && <p className="text-sm text-[var(--pt-red)] bg-[var(--pt-red-50)] rounded-lg px-3 py-2">{error}</p>}

      <button type="submit" disabled={pending || name.trim().length < 2}
        className="group w-full h-12 rounded-xl bg-[var(--pt-green)] text-white font-semibold inline-flex items-center justify-center gap-2 hover:bg-[var(--pt-green-600)] transition-colors disabled:opacity-60">
        {pending ? <Loader2 size={18} className="animate-spin" /> : <>Create my pharmacy <ArrowRight size={18} className="group-hover:translate-x-0.5 transition-transform" /></>}
      </button>
      <p className="text-xs text-[var(--pt-text-tertiary)] text-center">{trialDays}-day free trial · No card required</p>
    </form>
  )
}
