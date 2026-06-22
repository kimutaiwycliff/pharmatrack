"use client"

import { useState } from "react"
import Link from "next/link"
import { Loader2, ArrowRight, ArrowLeft, MailCheck } from "lucide-react"
import { Turnstile, turnstileEnabled } from "@/components/auth/Turnstile"
import { GoogleButton } from "@/components/auth/GoogleButton"

type Phase = "details" | "code"

export function SignupForm({ googleEnabled = false }: { googleEnabled?: boolean }) {
  const [phase, setPhase] = useState<Phase>("details")
  const [form, setForm] = useState({ pharmacy_name: "", owner_name: "", email: "", password: "" })
  const [otp, setOtp] = useState("")
  const [captcha, setCaptcha] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  // Step 1 → request a verification code, then advance to the code step.
  async function requestCode(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (form.password.length < 8) { setError("Password must be at least 8 characters"); return }
    setPending(true)
    try {
      const res = await fetch("/api/signup/send-otp", {
        method: "POST",
        headers: { "content-type": "application/json", ...(captcha ? { "x-captcha-response": captcha } : {}) },
        body: JSON.stringify({ email: form.email }),
      })
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (!res.ok) { setError(json.error ?? "Could not send code"); setPending(false); return }
      setPhase("code")
    } catch {
      setError("Network error — please try again")
    } finally {
      setPending(false)
    }
  }

  // Step 2 → verify code + create the tenant, then land in the app.
  async function createAccount(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setPending(true)
    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, otp }),
      })
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; signedIn?: boolean; error?: string }
      if (!res.ok) { setError(json.error ?? "Could not create your account"); setPending(false); return }
      window.location.href = json.signedIn ? "/home" : "/login"
    } catch {
      setError("Network error — please try again")
      setPending(false)
    }
  }

  async function resend() {
    setError(null)
    setPending(true)
    try {
      await fetch("/api/signup/send-otp", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: form.email }),
      })
    } finally {
      setPending(false)
    }
  }

  if (phase === "code") {
    return (
      <form onSubmit={createAccount} className="space-y-4">
        <div className="flex items-center gap-2.5 rounded-xl bg-[var(--pt-green-50)] text-[var(--pt-green-700)] px-3.5 py-3 text-sm">
          <MailCheck size={18} className="shrink-0" />
          <span>We emailed a 6-digit code to <strong>{form.email}</strong>.</span>
        </div>

        <label className="block">
          <span className="text-sm font-medium text-[var(--pt-text-secondary)]">Verification code</span>
          <input
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric" autoComplete="one-time-code" autoFocus placeholder="••••••"
            className="mt-1.5 w-full h-12 px-3.5 rounded-xl border border-[var(--pt-border)] bg-[var(--pt-surface)] text-center text-2xl tracking-[0.4em] font-semibold tabular-nums outline-none focus:border-[var(--pt-green)] focus:ring-2 focus:ring-[var(--pt-green)]/20"
          />
        </label>

        {error && <p className="text-sm text-[var(--pt-red)] bg-[var(--pt-red-50)] rounded-lg px-3 py-2">{error}</p>}

        <button type="submit" disabled={pending || otp.length !== 6}
          className="group w-full h-12 rounded-xl bg-[var(--pt-green)] text-white font-semibold inline-flex items-center justify-center gap-2 hover:bg-[var(--pt-green-600)] transition-colors disabled:opacity-60">
          {pending ? <Loader2 size={18} className="animate-spin" /> : <>Create account &amp; start trial <ArrowRight size={18} className="group-hover:translate-x-0.5 transition-transform" /></>}
        </button>

        <div className="flex items-center justify-between text-sm">
          <button type="button" onClick={() => { setPhase("details"); setOtp(""); setError(null) }} className="inline-flex items-center gap-1 text-[var(--pt-text-secondary)] hover:text-[var(--pt-text)]">
            <ArrowLeft size={14} /> Change email
          </button>
          <button type="button" onClick={resend} disabled={pending} className="font-semibold text-[var(--pt-green-700)] hover:underline disabled:opacity-60">
            Resend code
          </button>
        </div>
      </form>
    )
  }

  return (
    <form onSubmit={requestCode} className="space-y-4">
      {googleEnabled && (
        <>
          <GoogleButton label="Sign up with Google" />
          <div className="flex items-center gap-3 text-xs text-[var(--pt-text-tertiary)]">
            <span className="h-px flex-1 bg-[var(--pt-border)]" /> or with email <span className="h-px flex-1 bg-[var(--pt-border)]" />
          </div>
        </>
      )}

      <Field label="Pharmacy name" value={form.pharmacy_name} onChange={set("pharmacy_name")} placeholder="e.g. Westlands Chemist" autoFocus />
      <Field label="Your name" value={form.owner_name} onChange={set("owner_name")} placeholder="e.g. Jane Mwangi" />
      <Field label="Work email" type="email" value={form.email} onChange={set("email")} placeholder="you@pharmacy.co.ke" />
      <Field label="Password" type="password" value={form.password} onChange={set("password")} placeholder="At least 8 characters" />

      <Turnstile onToken={setCaptcha} />
      {error && <p className="text-sm text-[var(--pt-red)] bg-[var(--pt-red-50)] rounded-lg px-3 py-2">{error}</p>}

      <button type="submit" disabled={pending || (turnstileEnabled && !captcha)}
        className="group w-full h-12 rounded-xl bg-[var(--pt-green)] text-white font-semibold inline-flex items-center justify-center gap-2 hover:bg-[var(--pt-green-600)] transition-colors disabled:opacity-60">
        {pending ? <Loader2 size={18} className="animate-spin" /> : <>Continue <ArrowRight size={18} className="group-hover:translate-x-0.5 transition-transform" /></>}
      </button>

      <p className="text-xs text-[var(--pt-text-tertiary)] text-center">
        We&apos;ll email you a code to verify your address · No card · 14-day trial
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
