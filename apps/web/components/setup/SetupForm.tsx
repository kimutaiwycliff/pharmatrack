"use client"

import { useState } from "react"
import { Loader2, ShieldCheck, Eye, EyeOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { authClient } from "@/lib/auth/client"

export function SetupForm() {
  const [form, setForm] = useState({ full_name: "", email: "", password: "", confirm: "" })
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function submit() {
    setError(null)
    if (!form.email.trim()) return setError("Email is required")
    if (form.password.length < 8) return setError("Password must be at least 8 characters")
    if (form.password !== form.confirm) return setError("Passwords do not match")
    setLoading(true)
    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email, name: form.full_name || undefined, password: form.password }),
      })
      const json = (await res.json()) as { ok?: boolean; error?: string }
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Setup failed")
      // Sign in (sets the Better Auth session cookie), then go to the console.
      const signin = await authClient.signIn.email({ email: form.email, password: form.password })
      if (signin.error) throw new Error(signin.error.message ?? "Signed up but sign-in failed")
      window.location.href = "/platform"
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed")
      setLoading(false)
    }
  }

  return (
    <div className="bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] shadow-sm p-8">
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck size={18} className="text-[var(--pt-green-600)]" />
        <h1 className="text-xl font-bold tracking-tight text-[var(--pt-text)]">Create the platform admin</h1>
      </div>
      <p className="text-sm text-[var(--pt-text-secondary)] mb-6">
        This is the operator account that manages subscribers. It&apos;s a one-time step — once created, this screen is disabled.
      </p>

      <div className="space-y-4">
        <div>
          <Label htmlFor="full_name" className="text-sm font-medium">Full name</Label>
          <Input id="full_name" value={form.full_name} onChange={(e) => set("full_name", e.target.value)} placeholder="Operator name" className="mt-1.5 h-11" />
        </div>
        <div>
          <Label htmlFor="email" className="text-sm font-medium">Admin email</Label>
          <Input id="email" type="email" autoComplete="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="admin@yourdomain.co.ke" className="mt-1.5 h-11" />
        </div>
        <div>
          <Label htmlFor="password" className="text-sm font-medium mb-1.5 block">Password</Label>
          <div className="relative">
            <Input id="password" type={showPw ? "text" : "password"} autoComplete="new-password" value={form.password} onChange={(e) => set("password", e.target.value)} placeholder="At least 8 characters" className="h-11 pr-11" />
            <button type="button" onClick={() => setShowPw((v) => !v)} tabIndex={-1} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--pt-text-tertiary)] hover:text-[var(--pt-text-secondary)]" aria-label={showPw ? "Hide password" : "Show password"}>
              {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
        </div>
        <div>
          <Label htmlFor="confirm" className="text-sm font-medium">Confirm password</Label>
          <Input id="confirm" type={showPw ? "text" : "password"} autoComplete="new-password" value={form.confirm} onChange={(e) => set("confirm", e.target.value)} placeholder="Repeat password" className="mt-1.5 h-11" />
        </div>

        {error && (
          <p className="text-sm text-[var(--pt-red)] bg-[var(--pt-red-50)] px-3 py-2 rounded-lg">{error}</p>
        )}

        <Button onClick={submit} disabled={loading} className="w-full h-11 bg-[var(--pt-green)] hover:bg-[var(--pt-green-600)] text-white font-semibold mt-2">
          {loading ? <Loader2 size={16} className="animate-spin mr-1.5" /> : null}
          Create admin & continue
        </Button>
      </div>
    </div>
  )
}
