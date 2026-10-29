"use client"

import { useEffect } from "react"
import Link from "next/link"
import { AlertTriangle, LayoutDashboard, RotateCcw } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"

// A page that crashes inside the back office keeps the sidebar and top bar
// (the root error page replaced the whole app, leaving only "Try again").
// A stale JS chunk after a deploy is the usual cause — reload once for that,
// as app/error.tsx does.
const CHUNK_ERROR = /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|importing a module script failed/i

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    if (!CHUNK_ERROR.test(error?.message ?? "") && !CHUNK_ERROR.test(error?.name ?? "")) return
    try {
      const KEY = "pt-chunk-reload-at"
      if (Date.now() - Number(sessionStorage.getItem(KEY) || 0) > 10_000) {
        sessionStorage.setItem(KEY, String(Date.now()))
        window.location.reload()
      }
    } catch {
      window.location.reload()
    }
  }, [error])

  return (
    <div role="alert" className="max-w-md mx-auto mt-12 text-center bg-[var(--pt-surface)] border border-[var(--pt-border)] rounded-2xl px-6 py-10">
      <span className="mx-auto mb-4 w-12 h-12 rounded-full bg-amber-50 dark:bg-amber-500/15 flex items-center justify-center text-amber-600 dark:text-amber-400">
        <AlertTriangle size={22} />
      </span>
      <h1 className="text-lg font-bold">This page didn&apos;t load</h1>
      <p className="text-sm text-[var(--pt-text-secondary)] mt-1.5">
        It&apos;s usually a connection hiccup. Try again — the rest of PharmaTrack still works from the menu.
      </p>
      <div className="flex flex-wrap justify-center gap-2 mt-6">
        <Button onClick={() => reset()} className="gap-2 h-10">
          <RotateCcw size={15} /> Try again
        </Button>
        <Link href="/dashboard" className={`${buttonVariants({ variant: "outline" })} gap-2 h-10`}>
          <LayoutDashboard size={15} /> Dashboard
        </Link>
      </div>
      {error?.digest && <p className="text-[11px] text-[var(--pt-text-tertiary)] mt-5">Reference: {error.digest}</p>}
    </div>
  )
}
