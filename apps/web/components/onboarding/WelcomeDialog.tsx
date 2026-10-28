"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { FileSpreadsheet, Sparkles, Compass, Layers } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useSessionStore } from "@/lib/store/sessionStore"

// Straight after sign-up (/home?welcome=1 → /dashboard?welcome=1), greet the
// new owner and ask the one question that picks their path (ADR-019): how do
// you want to add your products?
export function WelcomeDialog() {
  const [open, setOpen] = useState(false)
  const name = useSessionStore((s) => s.profile?.full_name ?? "")

  useEffect(() => {
    const url = new URL(window.location.href)
    if (url.searchParams.get("welcome") !== "1") return
    // Shown once: drop the flag so a refresh doesn't bring it back.
    url.searchParams.delete("welcome")
    window.history.replaceState(null, "", url.pathname + url.search)
    const t = setTimeout(() => setOpen(true), 0)
    return () => clearTimeout(t)
  }, [])

  const first = name.split(" ")[0]
  const choice = "flex items-start gap-3 rounded-xl border p-4 text-left transition-all hover:shadow-md"

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-2xl">Welcome{first ? `, ${first}` : ""} 👋</DialogTitle>
          <DialogDescription className="text-base">
            Let&apos;s get your pharmacy selling — it takes about 15 minutes. First, how would you like to add your products?
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2.5">
          <Link href="/products?quickstart=1" onClick={() => setOpen(false)} className={`${choice} border-2 border-[var(--pt-green)] bg-[var(--pt-green-50)]`}>
            <Sparkles size={20} className="text-[var(--pt-green-600)] shrink-0 mt-0.5" />
            <span>
              <span className="block font-semibold">Pick from the catalogue <span className="ml-1 text-[11px] font-bold uppercase tracking-wide text-[var(--pt-green-700)]">Recommended</span></span>
              <span className="block text-sm text-[var(--pt-text-secondary)] mt-0.5">Tick what you stock from 3,800+ medicines, including the PPB register. No typing.</span>
            </span>
          </Link>
          <Link href="/inventory/stock-take?mode=setup" onClick={() => setOpen(false)} className={`${choice} border-[var(--pt-border)] hover:border-[var(--pt-green)]`}>
            <Layers size={20} className="text-[var(--pt-text-secondary)] shrink-0 mt-0.5" />
            <span>
              <span className="block font-semibold">Go shelf by shelf</span>
              <span className="block text-sm text-[var(--pt-text-secondary)] mt-0.5">Walk past your shelves and add products, prices and stock together. Best if you stock a lot.</span>
            </span>
          </Link>
          <Link href="/products?import=1" onClick={() => setOpen(false)} className={`${choice} border-[var(--pt-border)] hover:border-[var(--pt-green)]`}>
            <FileSpreadsheet size={20} className="text-[var(--pt-text-secondary)] shrink-0 mt-0.5" />
            <span>
              <span className="block font-semibold">I have an Excel list</span>
              <span className="block text-sm text-[var(--pt-text-secondary)] mt-0.5">Upload the export from your old system — columns are matched for you.</span>
            </span>
          </Link>
          <button type="button" onClick={() => setOpen(false)} className={`${choice} border-[var(--pt-border)] hover:border-[var(--pt-green)]`}>
            <Compass size={20} className="text-[var(--pt-text-secondary)] shrink-0 mt-0.5" />
            <span>
              <span className="block font-semibold">I&apos;ll look around first</span>
              <span className="block text-sm text-[var(--pt-text-secondary)] mt-0.5">Your setup guide stays on the dashboard and under Getting started.</span>
            </span>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
