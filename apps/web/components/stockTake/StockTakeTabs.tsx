"use client"

import Link from "next/link"
import { ClipboardList, PackagePlus } from "lucide-react"
import { useCan } from "@/lib/store/sessionStore"

// Receive stock has two jobs (ADR-020): a supplier delivery, or a shelf-by-shelf
// stock take. Shown on both pages so either is one tap away.
export function StockTakeTabs({ active }: { active: "delivery" | "stocktake" }) {
  const canReceive = useCan("stock.receive")
  const canCount = useCan("stock.count")
  if (!canReceive || !canCount) return null
  const tab = (on: boolean) =>
    `inline-flex items-center gap-2 h-9 px-4 rounded-md text-sm font-semibold transition-colors ${on ? "bg-[var(--pt-surface)] text-[var(--pt-text)] shadow-sm" : "text-[var(--pt-text-secondary)] hover:text-[var(--pt-text)]"}`
  return (
    <nav aria-label="Receive stock" className="inline-flex p-1 rounded-lg bg-[var(--pt-muted-strong)] mb-5">
      <Link href="/inventory/receive" className={tab(active === "delivery")} aria-current={active === "delivery" ? "page" : undefined}>
        <PackagePlus size={15} /> Delivery
      </Link>
      <Link href="/inventory/stock-take" className={tab(active === "stocktake")} aria-current={active === "stocktake" ? "page" : undefined}>
        <ClipboardList size={15} /> Stock take
      </Link>
    </nav>
  )
}
