"use client"

import { useState } from "react"
import Link from "next/link"
import { Loader2, MailCheck } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function ResetPasswordPage() {
  const supabase = createClient()
  const [email, setEmail] = useState("")
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setSending(true)
    setError(null)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/callback`,
      })
      if (error) throw new Error(error.message)
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send reset email")
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--pt-bg)] p-6">
      <div className="w-full max-w-sm bg-[var(--pt-surface)] rounded-2xl border border-[var(--pt-border)] p-8">
        {sent ? (
          <div className="text-center">
            <div className="w-12 h-12 rounded-xl bg-[var(--pt-green-50)] text-[var(--pt-green-600)] flex items-center justify-center mx-auto mb-4"><MailCheck size={24} /></div>
            <h1 className="text-lg font-bold">Check your email</h1>
            <p className="text-sm text-[var(--pt-text-secondary)] mt-2">
              If an account exists for <span className="font-medium">{email}</span>, we&apos;ve sent a link to reset your password.
            </p>
            <Link href="/login" className="inline-block mt-6 text-sm font-semibold text-[var(--pt-green-600)] hover:underline">Back to sign in</Link>
          </div>
        ) : (
          <>
            <h1 className="text-lg font-bold">Reset your password</h1>
            <p className="text-sm text-[var(--pt-text-secondary)] mt-1">Enter your email and we&apos;ll send you a reset link.</p>
            <form onSubmit={submit} className="mt-6 space-y-4">
              <div>
                <Label htmlFor="email" className="text-sm font-medium">Email</Label>
                <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@pharmacy.co.ke" className="mt-1.5 h-11" required />
              </div>
              {error && <p className="text-sm text-[var(--pt-red)] bg-[var(--pt-red-50)] px-3 py-2 rounded-lg">{error}</p>}
              <Button type="submit" disabled={sending} className="w-full h-11 gap-1.5">
                {sending && <Loader2 size={15} className="animate-spin" />} Send reset link
              </Button>
            </form>
            <Link href="/login" className="inline-block mt-5 text-sm text-[var(--pt-text-secondary)] hover:text-[var(--pt-text)]">← Back to sign in</Link>
          </>
        )}
      </div>
    </div>
  )
}
