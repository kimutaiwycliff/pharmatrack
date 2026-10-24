"use client"

import { useState } from "react"
import Link from "next/link"
import { Loader2, ArrowRight, ArrowLeft, MailCheck, Info } from "lucide-react"
import { Turnstile, turnstileEnabled } from "@/components/auth/Turnstile"
import { GoogleButton } from "@/components/auth/GoogleButton"
import { PriorTrialPanel, type PriorTrialInfo, type SignupIntent } from "@/components/marketing/PriorTrialPanel"
import { trialDaysForSignup } from "@/lib/launch-offer"

type Phase = "details" | "code"

interface SignupResponse {
  ok?: boolean; signedIn?: boolean; trial?: boolean; error?: string; code?: string
  priorTrial?: PriorTrialInfo | null
}

export function SignupForm({ googleEnabled = false }: { googleEnabled?: boolean }) {
  const trialDays = trialDaysForSignup()
  const [phase, setPhase] = useState<Phase>("details")
  const [form, setForm] = useState({ pharmacy_name: "", owner_name: "", email: "", password: "", registration_number: "" })
  const [otp, setOtp] = useState("")
  const [captcha, setCaptcha] = useState<string | null>(null)
  const [detailsWidget, setDetailsWidget] = useState(0)
  // Turnstile tokens are single-use: the resend button gets its own widget,
  // remounted (via key) after every resend for a fresh token.
  const [resendCaptcha, setResendCaptcha] = useState<string | null>(null)
  const [resendWidget, setResendWidget] = useState(0)
  const [resent, setResent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [accountExists, setAccountExists] = useState(false)
  // send-otp's early hint (no details until the code proves inbox ownership).
  const [priorHint, setPriorHint] = useState(false)
  // Full details from /api/signup once the code is verified.
  const [prior, setPrior] = useState<PriorTrialInfo | null>(null)
  const [pending, setPending] = useState(false)

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  function showError(json: { error?: string; code?: string }, fallback: string) {
    setAccountExists(json.code === "account_exists")
    setError(json.error ?? fallback)
  }

  // Step 1 → request a verification code, then advance to the code step.
  async function requestCode(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setAccountExists(false)
    if (form.password.length < 8) { setError("Password must be at least 8 characters"); return }
    setPending(true)
    try {
      const res = await fetch("/api/signup/send-otp", {
        method: "POST",
        headers: { "content-type": "application/json", ...(captcha ? { "x-captcha-response": captcha } : {}) },
        body: JSON.stringify({ email: form.email }),
      })
      const json = (await res.json().catch(() => ({}))) as Omit<SignupResponse, "priorTrial"> & { priorTrial?: boolean }
      if (!res.ok) {
        // The token was spent — remount the widget for a fresh one.
        setCaptcha(null)
        setDetailsWidget((n) => n + 1)
        showError(json, "Could not send code")
        return
      }
      setPriorHint(json.priorTrial === true)
      setPrior(null)
      setResent(false)
      setPhase("code")
    } catch {
      setError("Network error — please try again")
    } finally {
      setPending(false)
    }
  }

  // Step 2 → verify code + create the tenant, then land in the app.
  async function createAccount(intent?: SignupIntent, extensionMessage?: string) {
    setError(null)
    setAccountExists(false)
    setPending(true)
    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...form,
          registration_number: form.registration_number.trim() || undefined,
          otp,
          ...(intent ? { intent } : {}),
          ...(intent === "request_extension" && extensionMessage?.trim() ? { extension_message: extensionMessage.trim() } : {}),
        }),
      })
      const json = (await res.json().catch(() => ({}))) as SignupResponse
      if (res.status === 409 && json.code === "prior_trial") {
        setPrior(json.priorTrial ?? { pharmacy: null, trial_ended_at: null, matched_on: ["email"] })
        setPending(false)
        return
      }
      if (!res.ok) { showError(json, "Could not create your account"); setPending(false); return }
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
      const res = await fetch("/api/signup/send-otp", {
        method: "POST",
        headers: { "content-type": "application/json", ...(resendCaptcha ? { "x-captcha-response": resendCaptcha } : {}) },
        body: JSON.stringify({ email: form.email }),
      })
      const json = (await res.json().catch(() => ({}))) as SignupResponse
      if (!res.ok) showError(json, "Could not resend the code")
      else setResent(true)
    } catch {
      setError("Network error — please try again")
    } finally {
      setResendCaptcha(null)
      setResendWidget((n) => n + 1)
      setPending(false)
    }
  }

  const errorBox = error && (
    <p className="text-sm text-[var(--pt-red)] bg-[var(--pt-red-50)] rounded-lg px-3 py-2">
      {error}
      {accountExists && <> <Link href="/login" className="font-semibold underline">Sign in</Link></>}
    </p>
  )

  if (phase === "code" && prior) {
    return (
      <div className="space-y-4">
        <PriorTrialPanel prior={prior} pending={pending} onChoose={createAccount} />
        {errorBox}
        <button type="button" onClick={() => { setPrior(null); setError(null) }} className="inline-flex items-center gap-1 text-sm text-[var(--pt-text-secondary)] hover:text-[var(--pt-text)]">
          <ArrowLeft size={14} /> Back
        </button>
      </div>
    )
  }

  if (phase === "code") {
    return (
      <form onSubmit={(e) => { e.preventDefault(); void createAccount() }} className="space-y-4">
        <div className="flex items-center gap-2.5 rounded-xl bg-[var(--pt-green-50)] text-[var(--pt-green-700)] px-3.5 py-3 text-sm">
          <MailCheck size={18} className="shrink-0" />
          <span>We emailed a 6-digit code to <strong>{form.email}</strong>.{resent && " (sent again)"}</span>
        </div>

        {priorHint && (
          <div className="flex gap-2.5 rounded-xl border border-[var(--pt-border)] bg-[var(--pt-muted)] px-3.5 py-3 text-sm text-[var(--pt-text-secondary)]">
            <Info size={18} className="shrink-0 mt-0.5" />
            <span>
              You&apos;ve already tried PharmaTrack with this email — <Link href="/login" className="font-semibold text-[var(--pt-green-700)] hover:underline">sign in</Link>, or
              enter the code to subscribe.
            </span>
          </div>
        )}

        <label className="block">
          <span className="text-sm font-medium text-[var(--pt-text-secondary)]">Verification code</span>
          <input
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric" autoComplete="one-time-code" autoFocus placeholder="••••••"
            className="mt-1.5 w-full h-12 px-3.5 rounded-xl border border-[var(--pt-border)] bg-[var(--pt-surface)] text-center text-2xl tracking-[0.4em] font-semibold tabular-nums outline-none focus:border-[var(--pt-green)] focus:ring-2 focus:ring-[var(--pt-green)]/20"
          />
        </label>

        {errorBox}

        <button type="submit" disabled={pending || otp.length !== 6}
          className="group w-full h-12 rounded-xl bg-[var(--pt-green)] text-white font-semibold inline-flex items-center justify-center gap-2 hover:bg-[var(--pt-green-600)] transition-colors disabled:opacity-60">
          {pending ? <Loader2 size={18} className="animate-spin" /> : <>{priorHint ? "Continue" : "Create account & start trial"} <ArrowRight size={18} className="group-hover:translate-x-0.5 transition-transform" /></>}
        </button>

        <Turnstile key={resendWidget} onToken={setResendCaptcha} />

        <div className="flex items-center justify-between text-sm">
          <button type="button" onClick={() => { setPhase("details"); setOtp(""); setError(null); setAccountExists(false); setCaptcha(null) }} className="inline-flex items-center gap-1 text-[var(--pt-text-secondary)] hover:text-[var(--pt-text)]">
            <ArrowLeft size={14} /> Change email
          </button>
          <button type="button" onClick={resend} disabled={pending || (turnstileEnabled && !resendCaptcha)} className="font-semibold text-[var(--pt-green-700)] hover:underline disabled:opacity-60">
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
      <Field
        label="Pharmacy registration (PPB licence) number"
        hint="Optional"
        optional
        value={form.registration_number}
        onChange={set("registration_number")}
        placeholder="e.g. PPB/RET/1234/24"
        maxLength={60}
      />

      {/* Remounted on return from the code step so a fresh token is issued
          (the first one was spent sending the code). */}
      <Turnstile key={detailsWidget} onToken={setCaptcha} />
      {errorBox}

      <button type="submit" disabled={pending || (turnstileEnabled && !captcha)}
        className="group w-full h-12 rounded-xl bg-[var(--pt-green)] text-white font-semibold inline-flex items-center justify-center gap-2 hover:bg-[var(--pt-green-600)] transition-colors disabled:opacity-60">
        {pending ? <Loader2 size={18} className="animate-spin" /> : <>Continue <ArrowRight size={18} className="group-hover:translate-x-0.5 transition-transform" /></>}
      </button>

      <p className="text-xs text-[var(--pt-text-tertiary)] text-center">
        We&apos;ll email you a code to verify your address · No card · {trialDays}-day trial
      </p>
      <p className="text-xs text-[var(--pt-text-tertiary)] text-center">
        By continuing you agree to our <Link href="/terms" className="underline hover:text-[var(--pt-text-secondary)]">Terms</Link> and <Link href="/privacy" className="underline hover:text-[var(--pt-text-secondary)]">Privacy Policy</Link>.
      </p>
      <p className="text-sm text-center text-[var(--pt-text-secondary)]">
        Already have an account? <Link href="/login" className="font-semibold text-[var(--pt-green-700)] hover:underline">Sign in</Link>
      </p>
    </form>
  )
}

function Field({ label, hint, optional = false, ...props }: { label: string; hint?: string; optional?: boolean } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-[var(--pt-text-secondary)]">
        {label}{hint && <span className="ml-1.5 text-xs font-normal text-[var(--pt-text-tertiary)]">({hint})</span>}
      </span>
      <input
        {...props}
        required={!optional}
        className="mt-1.5 w-full h-11 px-3.5 rounded-xl border border-[var(--pt-border)] bg-[var(--pt-surface)] text-[var(--pt-text)] outline-none focus:border-[var(--pt-green)] focus:ring-2 focus:ring-[var(--pt-green)]/20 transition-shadow"
      />
    </label>
  )
}
