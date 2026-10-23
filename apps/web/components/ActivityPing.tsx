"use client"

import { useEffect } from "react"

// Tells the server (POST /api/activity) that someone is actually using this
// window, for the platform operator's usage insights: once on open, then at
// most every 5 minutes — only while the window is visible and someone has
// clicked or typed since the last ping, so a till left open overnight
// doesn't count as "in use". Silent; failures are ignored.

const EVERY_MS = 5 * 60_000

export function ActivityPing() {
  useEffect(() => {
    const source = "__TAURI_INTERNALS__" in window ? "desktop" : "web"
    let touched = true
    const send = () => {
      if (!touched || document.visibilityState !== "visible" || !navigator.onLine) return
      touched = false
      void fetch("/api/activity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source }),
        keepalive: true,
      }).catch(() => {})
    }
    const mark = () => { touched = true }
    send()
    window.addEventListener("pointerdown", mark, { passive: true })
    window.addEventListener("keydown", mark, { passive: true })
    const t = window.setInterval(send, EVERY_MS)
    return () => {
      window.removeEventListener("pointerdown", mark)
      window.removeEventListener("keydown", mark)
      window.clearInterval(t)
    }
  }, [])
  return null
}
