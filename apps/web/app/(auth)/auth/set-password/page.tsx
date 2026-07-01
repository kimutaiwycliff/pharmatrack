"use client"

import { Suspense, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { authClient } from "@/lib/auth/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

// useSearchParams reads the query at request time (SSR-safe), so it must sit
// inside a Suspense boundary. This is also why the page renders the right state
// immediately — no window access, no loading flash.
export default function SetPasswordPage() {
  return (
    <Suspense
      fallback={
        <Shell>
          <div className="mt-6 flex items-center gap-2 text-[var(--pt-text-secondary)] text-sm">
            <Loader2 size={16} className="animate-spin" /> Checking your link…
          </div>
        </Shell>
      }
    >
      <SetPasswordForm />
    </Suspense>
  )
}

function SetPasswordForm() {
  const router = useRouter()
  // Better Auth appends ?token=... to the reset/invite link.
  const token = useSearchParams().get("token")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) { toast.error("Use at least 8 characters"); return }
    if (password !== confirm) { toast.error("Passwords do not match"); return }
    if (!token) { toast.error("This link is invalid or has expired"); return }
    setSaving(true)
    try {
      const { error } = await authClient.resetPassword({ newPassword: password, token })
      if (error) throw new Error(error.message)
      toast.success("Password set — please sign in")
      router.push("/login")
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to set password")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Shell>
      {!token ? (
        <p className="mt-6 text-sm text-[var(--pt-red)]">This link is invalid or has expired. Please request a new invite or reset link.</p>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <Label className="text-sm font-medium">New password</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1.5 h-10" autoFocus />
          </div>
          <div>
            <Label className="text-sm font-medium">Confirm password</Label>
            <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="mt-1.5 h-10" />
          </div>
          <Button type="submit" disabled={saving} className="w-full gap-1.5">
            {saving && <Loader2 size={14} className="animate-spin" />} Set password &amp; continue
          </Button>
        </form>
      )}
    </Shell>
  )
}

// Card chrome shared by the form and the Suspense fallback.
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--pt-bg)] p-6">
      <div className="w-full max-w-sm bg-[var(--pt-surface)] rounded-2xl border border-[var(--pt-border)] p-8">
        <h1 className="text-lg font-bold">Set your password</h1>
        <p className="text-sm text-[var(--pt-text-secondary)] mt-1">Choose a password to finish setting up your PharmaTrack account.</p>
        {children}
      </div>
    </div>
  )
}
