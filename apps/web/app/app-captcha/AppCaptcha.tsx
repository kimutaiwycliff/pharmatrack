"use client"

import { useEffect, useState } from "react"
import { ShieldCheck } from "lucide-react"
import { Turnstile, turnstileEnabled } from "@/components/auth/Turnstile"

// Posts the Turnstile result to the Android app hosting this page in a
// WebView (apps/mobile/src/components/CaptchaSheet.tsx). Message shape:
// { type: "pt-captcha", token: string | null, reason?: "expired" | "disabled" }
declare global {
  interface Window {
    ReactNativeWebView?: { postMessage: (message: string) => void }
  }
}

function post(token: string | null, reason?: string) {
  window.ReactNativeWebView?.postMessage(JSON.stringify({ type: "pt-captcha", token, ...(reason ? { reason } : {}) }))
}

export function AppCaptcha() {
  const [done, setDone] = useState(false)

  // No site key configured (local/dev): nothing to solve — tell the app.
  useEffect(() => {
    if (!turnstileEnabled) post(null, "disabled")
  }, [])

  if (!turnstileEnabled) return null

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center bg-[var(--pt-bg)]">
      <ShieldCheck size={28} className="text-[var(--pt-green-600)]" aria-hidden />
      <p className="text-sm text-[var(--pt-text-secondary)] max-w-xs">
        {done ? "Checked — signing you in…" : "Quick security check before you sign in."}
      </p>
      <Turnstile
        onToken={(token) => {
          if (token) setDone(true)
          post(token, token ? undefined : "expired")
        }}
      />
    </main>
  )
}
