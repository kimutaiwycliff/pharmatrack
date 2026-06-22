"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import { authClient } from "@/lib/auth/client"

// "Continue with Google". New users land at /home, which routes them to
// /onboarding to name their pharmacy. Only rendered when Google is configured.

export function GoogleButton({ label = "Continue with Google" }: { label?: string }) {
  const [pending, setPending] = useState(false)
  return (
    <button
      type="button"
      disabled={pending}
      onClick={async () => {
        setPending(true)
        try {
          await authClient.signIn.social({ provider: "google", callbackURL: "/home" })
        } catch {
          setPending(false)
        }
      }}
      className="w-full h-11 rounded-xl border border-[var(--pt-border-strong)] bg-[var(--pt-surface)] text-[var(--pt-text)] font-semibold inline-flex items-center justify-center gap-2.5 hover:bg-[var(--pt-muted-strong)] transition-colors disabled:opacity-60"
    >
      {pending ? <Loader2 size={18} className="animate-spin" /> : <GoogleIcon />}
      {label}
    </button>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.23 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.05l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z" />
    </svg>
  )
}
