"use client"

import { useEffect } from "react"

// Root error boundary. Its most common trigger is a stale/missing JS chunk during
// client-side navigation (after a deploy the running tab references old hashes;
// in dev an on-demand compile can race) — which is exactly the "works on reload"
// symptom. For those we reload automatically; everything else gets a retry.
const CHUNK_ERROR = /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|importing a module script failed/i

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    if (CHUNK_ERROR.test(error?.message ?? "") || CHUNK_ERROR.test(error?.name ?? "")) {
      // Reload to fetch fresh chunks, but at most once per 10s so a genuinely
      // broken build can't trigger a reload loop.
      try {
        const KEY = "pt-chunk-reload-at"
        const last = Number(sessionStorage.getItem(KEY) || 0)
        if (Date.now() - last > 10_000) {
          sessionStorage.setItem(KEY, String(Date.now()))
          window.location.reload()
        }
      } catch {
        window.location.reload()
      }
    }
  }, [error])

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="w-12 h-12 rounded-full bg-[var(--pt-muted-strong)] flex items-center justify-center text-2xl">⚠️</div>
      <div>
        <h2 className="text-lg font-bold text-[var(--pt-text)]">This page couldn&apos;t load</h2>
        <p className="text-sm text-[var(--pt-text-secondary)] mt-1">Try again, or reload the page.</p>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => reset()}
          className="h-10 px-5 rounded-lg bg-[var(--pt-green)] text-white text-sm font-semibold hover:bg-[var(--pt-green-600)] transition-colors"
        >
          Try again
        </button>
        <button
          onClick={() => window.location.reload()}
          className="h-10 px-5 rounded-lg border border-[var(--pt-border-strong)] text-sm font-semibold hover:bg-[var(--pt-muted-strong)] transition-colors"
        >
          Reload
        </button>
      </div>
    </div>
  )
}
