"use client"

import { useState } from "react"
import Link from "next/link"
import { Loader2, ArrowRight } from "lucide-react"

export function SignupForm() {
  const [form, setForm] = useState({ pharmacy_name: "", owner_name: "", email: "", password: "" })
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setPending(true)
    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      })
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; signedIn?: boolean; error?: string }
      if (!res.ok) { setError(json.error ?? "Could not create your account"); setPending(false); return }
      window.location.href = json.signedIn ? "/home" : "/login"
    } catch {
      setError("Network error — please try again")
      setPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Pharmacy name" value={form.pharmacy_name} onChange={set("pharmacy_name")} placeholder="e.g. Westlands Chemist" autoFocus />
      <Field label="Your name" value={form.owner_name} onChange={set("owner_name")} placeholder="e.g. Jane Mwangi" />
      <Field label="Work email" type="email" value={form.email} onChange={set("email")} placeholder="you@pharmacy.co.ke" />
      <Field label="Password" type="password" value={form.password} onChange={set("password")} placeholder="At least 8 characters" />

      {error && (
        <p className="text-sm text-[var(--pt-red)] bg-[var(--pt-red-50)] rounded-lg px-3 py-2">{error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="group w-full h-12 rounded-xl bg-[var(--pt-green)] text-white font-semibold inline-flex items-center justify-center gap-2 hover:bg-[var(--pt-green-600)] transition-colors disabled:opacity-60"
      >
        {pending ? <Loader2 size={18} className="animate-spin" /> : <>Start my free trial <ArrowRight size={18} className="group-hover:translate-x-0.5 transition-transform" /></>}
      </button>

      <p className="text-xs text-[var(--pt-text-tertiary)] text-center">
        No card required · 14-day trial · By continuing you agree to our Terms.
      </p>
      <p className="text-sm text-center text-[var(--pt-text-secondary)]">
        Already have an account? <Link href="/login" className="font-semibold text-[var(--pt-green-700)] hover:underline">Sign in</Link>
      </p>
    </form>
  )
}

function Field({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-[var(--pt-text-secondary)]">{label}</span>
      <input
        {...props}
        required
        className="mt-1.5 w-full h-11 px-3.5 rounded-xl border border-[var(--pt-border)] bg-[var(--pt-surface)] text-[var(--pt-text)] outline-none focus:border-[var(--pt-green)] focus:ring-2 focus:ring-[var(--pt-green)]/20 transition-shadow"
      />
    </label>
  )
}
