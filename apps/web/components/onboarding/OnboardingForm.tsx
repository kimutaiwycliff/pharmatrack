"use client"

import { useState } from "react"
import { Loader2, ArrowRight } from "lucide-react"

export function OnboardingForm() {
  const [name, setName] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setPending(true)
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pharmacy_name: name }),
      })
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (!res.ok) { setError(json.error ?? "Something went wrong"); setPending(false); return }
      window.location.href = "/home"
    } catch {
      setError("Network error — please try again")
      setPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block">
        <span className="text-sm font-medium text-[var(--pt-text-secondary)]">Pharmacy name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required autoFocus placeholder="e.g. Westlands Chemist"
          className="mt-1.5 w-full h-11 px-3.5 rounded-xl border border-[var(--pt-border)] bg-[var(--pt-surface)] text-[var(--pt-text)] outline-none focus:border-[var(--pt-green)] focus:ring-2 focus:ring-[var(--pt-green)]/20"
        />
      </label>

      {error && <p className="text-sm text-[var(--pt-red)] bg-[var(--pt-red-50)] rounded-lg px-3 py-2">{error}</p>}

      <button type="submit" disabled={pending || name.trim().length < 2}
        className="group w-full h-12 rounded-xl bg-[var(--pt-green)] text-white font-semibold inline-flex items-center justify-center gap-2 hover:bg-[var(--pt-green-600)] transition-colors disabled:opacity-60">
        {pending ? <Loader2 size={18} className="animate-spin" /> : <>Create my pharmacy <ArrowRight size={18} className="group-hover:translate-x-0.5 transition-transform" /></>}
      </button>
      <p className="text-xs text-[var(--pt-text-tertiary)] text-center">14-day free trial · No card required</p>
    </form>
  )
}
