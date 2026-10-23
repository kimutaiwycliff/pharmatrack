"use client"

import { useEffect } from "react"

// Registers the PWA service worker (production only). Safe no-op in dev.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return
    if (!("serviceWorker" in navigator)) return
    navigator.serviceWorker.register("/sw.js").catch(() => {})
  }, [])
  return null
}

/**
 * Ask the worker to keep the till page and every script loaded so far. Called
 * by the POS a few seconds after it opens (TillRunner), so every chunk the
 * till needed is already in the resource list.
 */
export async function warmTillShell(): Promise<void> {
  if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return
  const reg = await navigator.serviceWorker.ready
  if (!reg.active) return
  const assets = performance
    .getEntriesByType("resource")
    .map((e) => e.name)
    .filter((n) => n.includes("/_next/static/"))
  reg.active.postMessage({ type: "warm", page: "/pos", assets })
}
