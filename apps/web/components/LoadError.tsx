"use client"

import { useState } from "react"
import { RotateCcw, WifiOff } from "lucide-react"
import { Button } from "@/components/ui/button"

// Shown when a page's data didn't load — instead of zeros or "nothing here",
// which on a bad connection read as real ("KES 0 today", "no prescriptions").
export function LoadError({ what, onRetry, className = "" }: {
  /** What didn't load, e.g. "today's sales". */
  what: string
  onRetry: () => unknown
  className?: string
}) {
  const [retrying, setRetrying] = useState(false)
  return (
    <div role="alert" className={`flex flex-col items-center justify-center gap-3 text-center rounded-xl border border-[var(--pt-border)] bg-[var(--pt-surface)] px-6 py-10 ${className}`}>
      <span className="w-11 h-11 rounded-full bg-amber-50 dark:bg-amber-500/15 flex items-center justify-center text-amber-600 dark:text-amber-400">
        <WifiOff size={20} />
      </span>
      <div>
        <p className="font-semibold">Couldn&apos;t load {what}</p>
        <p className="text-sm text-[var(--pt-text-secondary)] mt-1 max-w-sm">
          Check your internet connection and try again. Nothing has been lost.
        </p>
      </div>
      <Button
        variant="outline"
        className="gap-2 h-10"
        disabled={retrying}
        onClick={async () => {
          setRetrying(true)
          try { await onRetry() } finally { setRetrying(false) }
        }}
      >
        <RotateCcw size={15} className={retrying ? "animate-spin" : ""} />
        {retrying ? "Trying again…" : "Try again"}
      </Button>
    </div>
  )
}
