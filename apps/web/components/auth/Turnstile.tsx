"use client"

import { useEffect, useRef } from "react"

// Cloudflare Turnstile widget. Renders nothing (and never blocks) unless
// NEXT_PUBLIC_TURNSTILE_SITE_KEY is set, so dev/local works without keys.

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
const SCRIPT_ID = "cf-turnstile-script"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare global { interface Window { turnstile?: any } }

export const turnstileEnabled = !!SITE_KEY

export function Turnstile({ onToken }: { onToken: (token: string | null) => void }) {
  const elRef = useRef<HTMLDivElement>(null)
  const cbRef = useRef(onToken)
  cbRef.current = onToken

  useEffect(() => {
    if (!SITE_KEY) return
    let widgetId: string | undefined
    let poll: ReturnType<typeof setInterval> | undefined

    const render = () => {
      if (!elRef.current || !window.turnstile || widgetId !== undefined) return
      widgetId = window.turnstile.render(elRef.current, {
        sitekey: SITE_KEY,
        callback: (t: string) => cbRef.current(t),
        "error-callback": () => cbRef.current(null),
        "expired-callback": () => cbRef.current(null),
      })
    }

    if (window.turnstile) {
      render()
    } else if (!document.getElementById(SCRIPT_ID)) {
      const s = document.createElement("script")
      s.id = SCRIPT_ID
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
      s.async = true
      s.defer = true
      s.onload = render
      document.head.appendChild(s)
    } else {
      poll = setInterval(() => { if (window.turnstile) { clearInterval(poll); render() } }, 200)
    }

    return () => {
      if (poll) clearInterval(poll)
      if (widgetId !== undefined && window.turnstile) { try { window.turnstile.remove(widgetId) } catch { /* ignore */ } }
    }
  }, [])

  if (!SITE_KEY) return null
  return <div ref={elRef} className="min-h-[65px]" />
}
