"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Eye, EyeOff } from "lucide-react"
import { authClient } from "@/lib/auth/client"
import { Turnstile, turnstileEnabled } from "@/components/auth/Turnstile"
import { GoogleButton } from "@/components/auth/GoogleButton"

export function LoginForm({ googleEnabled = false }: { googleEnabled?: boolean }) {
  const [tab, setTab] = useState<"email" | "pin">("email")
  const [showPassword, setShowPassword] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [phone, setPhone] = useState("")
  const [pin, setPin] = useState("")
  const [captcha, setCaptcha] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onEmailSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setPending(true)
    const res = await authClient.signIn.email({
      email, password,
      fetchOptions: captcha ? { headers: { "x-captcha-response": captcha } } : undefined,
    })
    if (res.error) {
      setError(res.error.message ?? "Invalid email or password")
      setPending(false)
      return
    }
    // Session cookie set; root routes by role.
    window.location.href = "/home"
  }

  async function onPinSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setPending(true)
    // Custom Better Auth endpoint (lib/auth/pin-plugin); sets the same session cookie.
    const res = await fetch("/api/auth/sign-in/pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, pin }),
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string }
      setError(body.message ?? "Invalid phone or PIN")
      setPending(false)
      return
    }
    window.location.href = "/home"
  }

  return (
    <div className="w-full">
      <div className="bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] shadow-sm p-8">
        <h1 className="text-xl font-bold tracking-tight text-[var(--pt-text)] mb-1">Welcome back</h1>
        <p className="text-sm text-[var(--pt-text-secondary)] mb-6">Sign in to start your shift</p>

        <div className="grid grid-cols-2 bg-[var(--pt-muted-strong)] rounded-lg p-1 mb-5">
          {(["email", "pin"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => { setTab(t); setError(null) }}
              className={[
                "h-9 rounded-md text-sm font-semibold transition-all",
                tab === t
                  ? "bg-[var(--pt-surface)] text-[var(--pt-text)] shadow-sm"
                  : "text-[var(--pt-text-secondary)] hover:text-[var(--pt-text)]",
              ].join(" ")}
            >
              {t === "email" ? "Email Login" : "Quick PIN Login"}
            </button>
          ))}
        </div>

        {tab === "email" ? (
          <form onSubmit={onEmailSubmit} className="space-y-4">
            {googleEnabled && (
              <>
                <GoogleButton label="Continue with Google" />
                <div className="flex items-center gap-3 text-xs text-[var(--pt-text-tertiary)]">
                  <span className="h-px flex-1 bg-[var(--pt-border)]" /> or <span className="h-px flex-1 bg-[var(--pt-border)]" />
                </div>
              </>
            )}
            <div>
              <Label htmlFor="email" className="text-sm font-medium">Email</Label>
              <Input id="email" name="email" type="email" autoComplete="email" value={email}
                onChange={(e) => setEmail(e.target.value)} placeholder="you@pharmacy.co.ke" className="mt-1.5 h-11" required />
            </div>
            <div>
              <Label htmlFor="password" className="text-sm font-medium mb-1.5 block">Password</Label>
              <div className="relative">
                <Input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password"
                  value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="h-11 pr-11" required />
                <button type="button" onClick={() => setShowPassword((v) => !v)} tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--pt-text-tertiary)] hover:text-[var(--pt-text-secondary)] transition-colors"
                  aria-label={showPassword ? "Hide password" : "Show password"}>
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
              <div className="mt-1.5 text-right">
                <Link href="/auth/reset" className="text-xs font-medium text-[var(--pt-green-600)] hover:underline">Forgot password?</Link>
              </div>
            </div>

            <Turnstile onToken={setCaptcha} />
            {error && (
              <p className="text-sm text-[var(--pt-red)] bg-[var(--pt-red-50)] px-3 py-2 rounded-lg">{error}</p>
            )}

            <Button type="submit" disabled={pending || (turnstileEnabled && !captcha)}
              className="w-full h-11 bg-[var(--pt-green)] hover:bg-[var(--pt-green-600)] text-white font-semibold mt-2">
              {pending ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        ) : (
          <form onSubmit={onPinSubmit} className="space-y-4">
            <div>
              <Label htmlFor="phone" className="text-sm font-medium">Phone</Label>
              <Input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" value={phone}
                onChange={(e) => setPhone(e.target.value)} placeholder="0712 345 678" className="mt-1.5 h-11" required />
            </div>
            <div>
              <Label htmlFor="pin" className="text-sm font-medium mb-1.5 block">PIN</Label>
              <Input id="pin" name="pin" type="password" inputMode="numeric" autoComplete="off" maxLength={4}
                value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} placeholder="••••"
                className="h-11 tracking-[0.5em] text-center text-lg" required />
            </div>

            {error && (
              <p className="text-sm text-[var(--pt-red)] bg-[var(--pt-red-50)] px-3 py-2 rounded-lg">{error}</p>
            )}

            <Button type="submit" disabled={pending || pin.length < 4 || !phone}
              className="w-full h-11 bg-[var(--pt-green)] hover:bg-[var(--pt-green-600)] text-white font-semibold mt-2">
              {pending ? "Signing in…" : "Sign in with PIN"}
            </Button>
          </form>
        )}
      </div>

      <p className="text-center text-[10px] text-[var(--pt-text-tertiary)] tracking-widest uppercase mt-6">
        Powered by <span className="font-semibold text-[var(--pt-text-secondary)]">PharmaTrack</span>
      </p>
    </div>
  )
}
