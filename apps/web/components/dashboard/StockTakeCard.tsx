"use client"

import Link from "next/link"
import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { ClipboardList, ShieldAlert } from "lucide-react"
import type { Shelf } from "@/lib/stockTake/server"

// Dashboard nudge for stock takes (ADR-020): counts waiting for approval, and
// how many shelves are due a count (never counted, or not in 90 days). Count
// one shelf a week instead of one dreaded full stock take a year.

interface Resp {
  shelves: Shelf[]
  sessions: Array<{ id: string; title: string; status: "draft" | "review" | "posted"; created_by: string | null }>
  can: { adjust: boolean }
}

const DUE_DAYS = 90

export function StockTakeCard({ branchId }: { branchId: string }) {
  const [now] = useState(() => Date.now())
  const { data } = useQuery<Resp>({
    queryKey: ["stock-take", branchId],
    queryFn: async () => {
      const res = await fetch(`/api/stock-take?branch_id=${branchId}`)
      if (!res.ok) throw new Error("Couldn't load stock take")
      return res.json()
    },
    staleTime: 5 * 60_000,
  })
  if (!data) return null
  const withStock = data.shelves.filter((s) => s.products > 0)
  if (withStock.length === 0) return null
  const due = withStock.filter((s) => !s.lastCounted || now - new Date(s.lastCounted).getTime() > DUE_DAYS * 86_400_000)
  const waiting = data.sessions.filter((s) => s.status === "review")
  const open = data.sessions.filter((s) => s.status === "draft")
  if (due.length === 0 && waiting.length === 0 && open.length === 0) return null
  const next = [...due].sort((a, b) => b.products - a.products)[0]

  return (
    <section className="rounded-xl border border-[var(--pt-border)] bg-[var(--pt-surface)] p-5 mb-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="size-9 rounded-lg bg-[var(--pt-green-50)] text-[var(--pt-green-600)] flex items-center justify-center shrink-0"><ClipboardList size={18} /></span>
          <div>
            <h2 className="font-semibold">Stock take</h2>
            <p className="text-sm text-[var(--pt-text-secondary)] mt-0.5">
              {due.length > 0
                ? `${due.length} of ${withStock.length} shelves are due a count.${next ? ` Start with ${next.name} — ${next.products} product${next.products === 1 ? "" : "s"}.` : ""}`
                : "Every shelf has been counted in the last 90 days."}
              {open.length > 0 && ` ${open.length} count${open.length === 1 ? " is" : "s are"} in progress.`}
            </p>
          </div>
        </div>
        <Link href="/inventory/stock-take" className="inline-flex items-center h-9 px-4 rounded-lg border border-[var(--pt-border)] text-sm font-semibold hover:bg-[var(--pt-muted)]">
          {open.length ? "Continue" : "Count a shelf"}
        </Link>
      </div>
      {data.can.adjust && waiting.length > 0 && (
        <ul className="mt-4 space-y-2">
          {waiting.map((s) => (
            <li key={s.id}>
              <Link href={`/inventory/stock-take/${s.id}`} className="flex items-center gap-2 rounded-lg border border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10 px-3 py-2 text-sm hover:underline">
                <ShieldAlert size={15} className="text-blue-600 shrink-0" />
                <span className="flex-1"><span className="font-semibold">{s.title}</span> is waiting for your approval{s.created_by ? ` · counted by ${s.created_by}` : ""}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
