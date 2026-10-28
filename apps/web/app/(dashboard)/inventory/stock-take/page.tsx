"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import { ArrowLeft, ChevronRight, ClipboardList, Download, Layers, Loader2, Sparkles } from "lucide-react"
import { StockTakeTabs } from "@/components/stockTake/StockTakeTabs"
import { useBranchScope } from "@/lib/hooks/useBranchScope"
import { useUIStore } from "@/lib/store/uiStore"
import type { Shelf } from "@/lib/stockTake/server"

// Stock take, shelf by shelf (ADR-020): pick a department or subcategory and
// count it. "Set up from the catalogue" is the same walk for a new pharmacy —
// products, prices and stock in one pass.

type Mode = "count" | "setup"
interface Session {
  id: string; kind: Mode; title: string; status: "draft" | "review" | "posted"; updated_at: string; posted_at: string | null
  created_by: string | null; lines: number; totals: Record<string, number> | null
}
interface ShelvesResponse { shelves: Shelf[]; sessions: Session[]; can: { adjust: boolean; setup: boolean; viewCost: boolean } }

const DAY = 86_400_000
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-KE", { timeZone: "Africa/Nairobi", day: "numeric", month: "short" })
const stale = (iso: string | null) => !iso || Date.now() - new Date(iso).getTime() > 90 * DAY

export default function StockTakePage() {
  const router = useRouter()
  const { branchId, branches, ready } = useBranchScope()
  const setActiveBranch = useUIStore((s) => s.setActiveBranch)
  const { data, isLoading } = useQuery<ShelvesResponse>({
    queryKey: ["stock-take", branchId],
    enabled: !!branchId,
    queryFn: async () => {
      const res = await fetch(`/api/stock-take?branch_id=${branchId}`)
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Couldn't load shelves")
      return res.json()
    },
  })
  const totalProducts = data?.shelves.reduce((n, s) => n + s.products, 0) ?? 0
  // ?mode=setup (from the setup guide / welcome dialog) opens setup straight away.
  const [chosenMode, setMode] = useState<Mode | null>(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("mode") === "setup" ? "setup" : null)
  // New pharmacies start in setup; everyone else counts.
  const mode: Mode = chosenMode ?? (data?.can.setup && totalProducts < 30 ? "setup" : "count")
  const [open, setOpen] = useState<string | null>(null)
  const [hideQty, setHideQty] = useState(true)
  const [showEmpty, setShowEmpty] = useState(false)
  const [starting, setStarting] = useState<string | null>(null)

  const shelves = useMemo(() => {
    const list = data?.shelves ?? []
    const useful = (s: Shelf) => (mode === "count" ? s.products > 0 : s.catalog > 0 || s.products > 0)
    return { shown: list.filter(useful), empty: list.filter((s) => !useful(s)) }
  }, [data, mode])
  const waiting = data?.can.adjust ? (data.sessions ?? []).filter((s) => s.status === "review") : []
  const inProgress = (data?.sessions ?? []).filter((s) => s.status !== "posted" && !waiting.includes(s))
  const recent = (data?.sessions ?? []).filter((s) => s.status === "posted").slice(0, 8)

  async function start(shelf: Shelf) {
    if (!branchId) return
    setStarting(shelf.id)
    try {
      const res = await fetch("/api/stock-take", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch_id: branchId, kind: mode, category_id: shelf.categoryId, taxonomy_key: shelf.taxonomyKey, hide_expected: mode === "count" ? hideQty : false }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? "Couldn't start")
      if (body.resumed) toast.info(`Continuing the ${shelf.name} count already in progress`)
      router.push(`/inventory/stock-take/${body.id}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't start")
      setStarting(null)
    }
  }

  if (!ready) return null
  if (!branchId) {
    return (
      <div className="max-w-md mx-auto mt-10 bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] p-6">
        <h1 className="text-lg font-bold">Which branch are you counting?</h1>
        <p className="text-sm text-[var(--pt-text-secondary)] mt-1 mb-4">A stock take counts one branch&apos;s shelves.</p>
        <div className="space-y-2">
          {branches.map((b) => (
            <button key={b.id} onClick={() => setActiveBranch(b.id)}
              className="w-full text-left px-4 py-3 rounded-lg border border-[var(--pt-border)] hover:border-[var(--pt-green)] hover:bg-[var(--pt-green-50)] text-sm font-semibold transition-colors">
              {b.name}
            </button>
          ))}
        </div>
      </div>
    )
  }

  const openShelf = shelves.shown.concat(shelves.empty).find((s) => s.id === open) ?? null

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => router.push("/inventory")} aria-label="Back to inventory"
          className="w-8 h-8 rounded-md flex items-center justify-center text-[var(--pt-text-secondary)] hover:bg-[var(--pt-muted-strong)] transition-colors">
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Stock take</h1>
          <p className="text-sm text-[var(--pt-text-secondary)] mt-0.5">Count one shelf at a time. Your count saves as you go.</p>
        </div>
      </div>
      <StockTakeTabs active="stocktake" />

      {data?.can.setup && (
        <div role="radiogroup" aria-label="What are you doing?" className="grid sm:grid-cols-2 gap-3 mb-5">
          {([
            ["count", ClipboardList, "Count what's on the shelf", "Check your stock against the shelf and fix differences."],
            ["setup", Sparkles, "Set up from the catalogue", "New here? Add products, prices and stock in one walk past your shelves."],
          ] as const).map(([m, Icon, title, sub]) => (
            <button key={m} role="radio" aria-checked={mode === m} onClick={() => { setMode(m); setOpen(null) }}
              className={`text-left rounded-xl border p-4 transition-colors ${mode === m ? "border-[var(--pt-green)] bg-[var(--pt-green-50)] ring-1 ring-[var(--pt-green)]" : "border-[var(--pt-border)] bg-[var(--pt-surface)] hover:bg-[var(--pt-muted)]"}`}>
              <span className="flex items-center gap-2 font-semibold text-sm"><Icon size={16} className="text-[var(--pt-green-600)]" /> {title}</span>
              <span className="block text-xs text-[var(--pt-text-secondary)] mt-1">{sub}</span>
            </button>
          ))}
        </div>
      )}

      {waiting.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-blue-700 dark:text-blue-300 mb-2">Waiting for your approval</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {waiting.map((s) => (
              <Link key={s.id} href={`/inventory/stock-take/${s.id}`}
                className="flex items-center gap-3 rounded-xl border border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10 p-4 hover:border-blue-400 transition-colors">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-sm truncate">{s.title}</div>
                  <div className="text-xs text-[var(--pt-text-secondary)] mt-0.5">{s.lines} counted{s.created_by ? ` by ${s.created_by}` : ""} · tap to review</div>
                </div>
                <ChevronRight size={16} className="text-[var(--pt-text-tertiary)]" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {inProgress.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-[var(--pt-text-secondary)] mb-2">In progress</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {inProgress.map((s) => (
              <Link key={s.id} href={`/inventory/stock-take/${s.id}`}
                className="flex items-center gap-3 rounded-xl border border-[var(--pt-border)] bg-[var(--pt-surface)] p-4 hover:border-[var(--pt-green)] transition-colors">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-sm truncate">{s.title}</div>
                  <div className="text-xs text-[var(--pt-text-secondary)] mt-0.5">
                    {s.status === "review" ? <span className="text-amber-700 dark:text-amber-300 font-semibold">Waiting for approval</span> : `${s.lines} counted`}
                    {" · "}{s.kind === "setup" ? "Setup" : "Count"}{s.created_by ? ` · ${s.created_by}` : ""}
                  </div>
                </div>
                <ChevronRight size={16} className="text-[var(--pt-text-tertiary)]" />
              </Link>
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="shelves-h">
        <div className="flex flex-wrap items-end justify-between gap-2 mb-2">
          <h2 id="shelves-h" className="text-sm font-semibold text-[var(--pt-text-secondary)]">{mode === "setup" ? "Pick a shelf to set up" : "Pick a shelf to count"}</h2>
          {mode === "count" && (
            <label className="flex items-center gap-2 text-xs text-[var(--pt-text-secondary)]">
              <input type="checkbox" className="size-4 accent-[var(--pt-green)]" checked={hideQty} onChange={(e) => setHideQty(e.target.checked)} />
              Hide recorded quantities while counting (recommended)
            </label>
          )}
        </div>
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-24 rounded-xl border border-[var(--pt-border)] bg-[var(--pt-surface)] animate-pulse" />)}
          </div>
        ) : shelves.shown.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--pt-border)] p-8 text-center">
            <Layers className="mx-auto text-[var(--pt-text-tertiary)]" size={28} />
            <p className="font-semibold mt-2">No products on your shelves yet</p>
            <p className="text-sm text-[var(--pt-text-secondary)] mt-1">Use &ldquo;Set up from the catalogue&rdquo; to add what you stock, shelf by shelf.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {[...shelves.shown, ...(showEmpty ? shelves.empty : [])].map((s) => {
              const old = mode === "count" && stale(s.lastCounted)
              return (
                <button key={s.id} onClick={() => setOpen(open === s.id ? null : s.id)} aria-expanded={open === s.id}
                  className={`text-left rounded-xl border p-4 bg-[var(--pt-surface)] transition-colors ${open === s.id ? "border-[var(--pt-green)] ring-1 ring-[var(--pt-green)]" : "border-[var(--pt-border)] hover:bg-[var(--pt-muted)]"}`}>
                  <div className="font-semibold text-sm leading-snug">{s.name}</div>
                  <div className="text-xs text-[var(--pt-text-secondary)] mt-1">
                    {mode === "setup" ? `${s.catalog} common medicines${s.products ? ` · ${s.products} added` : ""}` : `${s.products} product${s.products === 1 ? "" : "s"}`}
                  </div>
                  {mode === "count" && (
                    <div className={`text-[11px] mt-2 inline-flex items-center gap-1.5 ${old ? "text-amber-700 dark:text-amber-300" : "text-[var(--pt-text-tertiary)]"}`}>
                      <span className={`size-1.5 rounded-full ${old ? "bg-amber-500" : "bg-[var(--pt-green)]"}`} />
                      {s.lastCounted ? `Counted ${fmtDate(s.lastCounted)}` : "Never counted"}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        )}
        {shelves.empty.length > 0 && !isLoading && (
          <button onClick={() => setShowEmpty((v) => !v)} className="mt-3 text-xs font-semibold text-[var(--pt-green-600)] hover:underline">
            {showEmpty ? "Hide empty shelves" : `Show ${shelves.empty.length} empty shelves`}
          </button>
        )}
      </section>

      {openShelf && (
        <div className="fixed inset-x-0 bottom-0 z-40 sm:static sm:mt-4 rounded-t-2xl sm:rounded-xl border border-[var(--pt-border)] bg-[var(--pt-surface)] p-4 shadow-xl sm:shadow-none max-h-[70vh] overflow-y-auto">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <div className="font-bold">{openShelf.name}</div>
              <div className="text-xs text-[var(--pt-text-secondary)]">Do it all, or one subcategory at a time.</div>
            </div>
            <button onClick={() => start(openShelf)} disabled={starting !== null}
              className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-[var(--pt-green)] text-white text-sm font-semibold hover:bg-[var(--pt-green-600)] disabled:opacity-60 shrink-0">
              {starting === openShelf.id ? <Loader2 size={15} className="animate-spin" /> : null}
              {mode === "setup" ? "Set up all" : "Count all"}
            </button>
          </div>
          {openShelf.children.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {openShelf.children
                .filter((c) => (mode === "count" ? c.products > 0 : c.catalog > 0 || c.products > 0))
                .map((c) => (
                  <button key={c.id} onClick={() => start(c)} disabled={starting !== null}
                    className="inline-flex items-center gap-2 h-9 px-3 rounded-full border border-[var(--pt-border)] text-sm hover:border-[var(--pt-green)] hover:bg-[var(--pt-green-50)] disabled:opacity-60">
                    {starting === c.id && <Loader2 size={13} className="animate-spin" />}
                    {c.name}
                    <span className="text-xs text-[var(--pt-text-tertiary)]">{mode === "setup" ? c.catalog : c.products}</span>
                  </button>
                ))}
            </div>
          )}
          <button onClick={() => setOpen(null)} className="sm:hidden mt-4 w-full h-10 rounded-lg border border-[var(--pt-border)] text-sm font-semibold">Close</button>
        </div>
      )}

      {recent.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-[var(--pt-text-secondary)] mb-2">Finished</h2>
          <ul className="divide-y divide-[var(--pt-border)] rounded-xl border border-[var(--pt-border)] bg-[var(--pt-surface)]">
            {recent.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                <Link href={`/inventory/stock-take/${s.id}`} className="min-w-0 flex-1">
                  <div className="text-sm font-semibold truncate">{s.title}</div>
                  <div className="text-xs text-[var(--pt-text-secondary)]">
                    {s.posted_at ? fmtDate(s.posted_at) : ""} · {s.kind === "setup"
                      ? `${s.totals?.productsAdded ?? 0} products, ${s.totals?.batchesAdded ?? 0} batches added`
                      : `${s.totals?.adjusted ?? 0} corrected`}
                  </div>
                </Link>
                <a href={`/api/stock-take/${s.id}/report`} className="p-2 rounded-lg hover:bg-[var(--pt-muted)]" aria-label={`Download ${s.title} report`} title="Download CSV">
                  <Download size={16} />
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
