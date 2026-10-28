"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  ArrowLeft, Check, ChevronDown, CloudOff, Loader2, Plus, ScanLine, Search, ShieldAlert, Trash2, X, XCircle,
} from "lucide-react"
import { expiryMonthEnd, splitUnits, toBaseUnits, type BarcodeScanEvent } from "@pharmatrack/core"
import { useBarcodeScanner } from "@/lib/barcode/useBarcodeScanner"
import { useConfirm } from "@/components/ui/confirm-dialog"
import { ReviewPanel } from "@/components/stockTake/ReviewPanel"
import type { StockTakeItem } from "@/lib/stockTake/server"

// The counting screen of a stock take (ADR-020). One scrolling list of the
// shelf, grouped by subcategory; tap a product to count its batches (packs +
// loose units), add a batch found on the shelf, or mark it as none. Every
// change autosaves; the recorded quantity is captured by the server at the
// moment each batch is counted.

interface ServerLine {
  id: string; product_id: string | null; catalog_id: string | null; batch_id: string | null
  batch_number: string | null; expiry_date: string | null; barcode: string | null
  expected_qty: number | null; counted_qty: number; selling_price: number | null; cost_price: number | null
  price_confirmed: boolean; counted_by: string | null
}
interface SessionResponse {
  session: { id: string; kind: "count" | "setup"; title: string; status: "draft" | "review" | "posted" | "cancelled"; hide_expected: boolean; totals: Record<string, number> | null }
  items: StockTakeItem[]
  lines: ServerLine[]
  can: { adjust: boolean; setup: boolean; editPrice: boolean; viewCost: boolean }
}
interface Draft {
  id: string; itemKey: string; productId: string | null; catalogId: string | null; batchId: string | null
  batchNumber: string; expiry: string; packs: string; loose: string
}
interface Price { sell: string; costPack: string }

const num = (s: string) => (s.trim() === "" ? null : Number(s))
const ym = (d: string | null) => (d ? d.slice(0, 7) : "")
const monthLabel = (d: string) => new Date(`${d.slice(0, 7)}-15T12:00:00+03:00`).toLocaleDateString("en-KE", { month: "short", year: "numeric" })
const keyOfLine = (l: { product_id: string | null; catalog_id: string | null }) => (l.product_id ? `p:${l.product_id}` : `k:${l.catalog_id}`)

function countedOf(d: Draft, upp: number): number | null {
  if (d.packs.trim() === "" && d.loose.trim() === "") return null
  return toBaseUnits(Number(d.packs || 0), Number(d.loose || 0), upp)
}

export function CountSheet({ id }: { id: string }) {
  const router = useRouter()
  const qc = useQueryClient()
  const confirm = useConfirm()
  const [all, setAll] = useState(false)
  const { data, isLoading, error } = useQuery<SessionResponse>({
    queryKey: ["stock-take-session", id, all],
    queryFn: async () => {
      const res = await fetch(`/api/stock-take/${id}${all ? "?all=1" : ""}`)
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? "Couldn't load this stock take")
      return body
    },
    staleTime: Infinity,
    placeholderData: (prev) => prev,
  })

  // ── Local state: drafts per line, prices and barcodes per product ──────────
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [prices, setPrices] = useState<Record<string, Price>>({})
  const [barcodes, setBarcodes] = useState<Record<string, string>>({})
  const [extra, setExtra] = useState<StockTakeItem[]>([])
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    if (!data || loaded) return
    const upp = new Map(data.items.map((i) => [i.key, i.unitsPerPack]))
    const d: Record<string, Draft> = {}
    const p: Record<string, Price> = {}
    const b: Record<string, string> = {}
    for (const l of data.lines) {
      const k = keyOfLine(l)
      const { packs, loose } = splitUnits(l.counted_qty, upp.get(k) ?? 1)
      d[l.id] = {
        id: l.id, itemKey: k, productId: l.product_id, catalogId: l.catalog_id, batchId: l.batch_id,
        batchNumber: l.batch_number ?? "", expiry: ym(l.expiry_date), packs: String(packs), loose: loose ? String(loose) : "",
      }
      if (l.price_confirmed && l.selling_price != null) p[k] = { sell: String(l.selling_price), costPack: l.cost_price != null ? String(Math.round(l.cost_price * (upp.get(k) ?? 1) * 100) / 100) : "" }
      if (l.barcode) b[k] = l.barcode
    }
    // One-time hydrate from the server; after this the screen owns the drafts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDrafts(d); setPrices(p); setBarcodes(b); setLoaded(true)
  }, [data, loaded])

  const items = useMemo(() => {
    const base = data?.items ?? []
    const have = new Set(base.map((i) => i.key))
    return [...extra.filter((i) => !have.has(i.key)), ...base]
  }, [data, extra])
  const itemByKey = useMemo(() => new Map(items.map((i) => [i.key, i])), [items])
  const linesOf = useMemo(() => {
    const m = new Map<string, Draft[]>()
    for (const d of Object.values(drafts)) m.set(d.itemKey, [...(m.get(d.itemKey) ?? []), d])
    return m
  }, [drafts])

  // ── Autosave ───────────────────────────────────────────────────────────────
  // Which lines still need saving (bumped on every edit, so a save that
  // raced a newer edit doesn't clear it). A stable object, not state.
  const [track] = useState(() => ({ dirty: new Map<string, object>(), deleted: new Set<string>() }))
  const [save, setSave] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const markDirty = useCallback((ids: string[]) => { for (const i of ids) track.dirty.set(i, {}) }, [track])
  const status = data?.session.status
  const readOnly = status === "posted" || status === "cancelled"

  const flush = useCallback(async () => {
    if (readOnly) return true
    const sending = new Map(track.dirty)
    const del = new Set(track.deleted)
    const lines = []
    const waiting = new Set<string>()
    for (const lineId of sending.keys()) {
      const d = drafts[lineId]
      if (!d) continue
      const item = itemByKey.get(d.itemKey)
      const upp = item?.unitsPerPack ?? 1
      const counted = countedOf(d, upp)
      if (counted == null) { del.add(lineId); continue } // cleared → forget the line
      if (!d.batchId && !expiryMonthEnd(d.expiry)) { waiting.add(lineId); continue } // a found batch waits for its expiry month
      const price = prices[d.itemKey]
      const sell = price ? num(price.sell) : null
      const costPack = price ? num(price.costPack) : null
      lines.push({
        id: d.id, product_id: d.productId, catalog_id: d.catalogId, batch_id: d.batchId,
        batch_number: d.batchNumber.trim() || null, expiry_date: d.batchId ? null : expiryMonthEnd(d.expiry),
        barcode: barcodes[d.itemKey] ?? null, counted_qty: counted,
        selling_price: sell, price_confirmed: sell != null && sell > 0,
        cost_price: costPack != null ? Math.round((costPack / upp) * 100) / 100 : null,
      })
    }
    if (lines.length === 0 && del.size === 0) return waiting.size === 0
    setSave("saving")
    try {
      const res = await fetch(`/api/stock-take/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lines, delete_ids: [...del] }) })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? "Couldn't save")
      for (const [lineId, s] of sending) if (!waiting.has(lineId) && track.dirty.get(lineId) === s) track.dirty.delete(lineId)
      for (const x of del) track.deleted.delete(x)
      setSave("saved")
      return waiting.size === 0
    } catch (e) {
      setSave("error")
      if (!(e instanceof TypeError)) toast.error(e instanceof Error ? e.message : "Couldn't save")
      return false
    }
  }, [barcodes, drafts, id, itemByKey, prices, readOnly, track])

  useEffect(() => {
    if (!loaded) return
    const t = setTimeout(() => { void flush() }, 700)
    return () => clearTimeout(t)
  }, [drafts, prices, barcodes, loaded, flush])
  useEffect(() => {
    const retry = () => { if (track.dirty.size || track.deleted.size) void flush() }
    window.addEventListener("online", retry)
    return () => window.removeEventListener("online", retry)
  }, [flush, track])

  // ── Editing ────────────────────────────────────────────────────────────────
  function setDraft(d: Draft) {
    setDrafts((prev) => ({ ...prev, [d.id]: d }))
    markDirty([d.id])
  }
  function batchDraft(item: StockTakeItem, batchId: string): Draft {
    return (linesOf.get(item.key) ?? []).find((d) => d.batchId === batchId) ?? {
      id: `new-${item.key}-${batchId}`, itemKey: item.key, productId: item.productId, catalogId: item.productId ? null : item.catalogId,
      batchId, batchNumber: "", expiry: "", packs: "", loose: "",
    }
  }
  // Placeholder drafts get a real id the first time something is typed.
  function changeDraft(d: Draft) {
    setDraft(d.id.startsWith("new-") ? { ...d, id: crypto.randomUUID() } : d)
  }
  function addBatch(item: StockTakeItem, prefill?: { batchNumber?: string; expiry?: string }) {
    const d: Draft = {
      id: crypto.randomUUID(), itemKey: item.key, productId: item.productId, catalogId: item.productId ? null : item.catalogId,
      batchId: null, batchNumber: prefill?.batchNumber ?? "", expiry: prefill?.expiry ?? "", packs: "", loose: "",
    }
    setDrafts((prev) => ({ ...prev, [d.id]: d }))
    return d
  }
  function removeDraft(d: Draft) {
    setDrafts((prev) => { const next = { ...prev }; delete next[d.id]; return next })
    track.dirty.delete(d.id)
    track.deleted.add(d.id)
  }
  function noneOnShelf(item: StockTakeItem) {
    const updates: Draft[] = item.batches.map((b) => {
      const d = batchDraft(item, b.id)
      return { ...d, id: d.id.startsWith("new-") ? crypto.randomUUID() : d.id, packs: "0", loose: "" }
    })
    const found = (linesOf.get(item.key) ?? []).filter((d) => !d.batchId)
    setDrafts((prev) => {
      const next = { ...prev }
      for (const f of found) delete next[f.id]
      for (const u of updates) next[u.id] = u
      return next
    })
    for (const f of found) { track.dirty.delete(f.id); track.deleted.add(f.id) }
    markDirty(updates.map((u) => u.id))
  }
  function setPrice(item: StockTakeItem, p: Price) {
    setPrices((prev) => ({ ...prev, [item.key]: p }))
    markDirty((linesOf.get(item.key) ?? []).map((d) => d.id))
  }

  // ── Filters, expansion, scanning ───────────────────────────────────────────
  const [filter, setFilter] = useState("")
  const [onlyOpen, setOnlyOpen] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const isCounted = useCallback((item: StockTakeItem) => (linesOf.get(item.key) ?? []).some((d) => countedOf(d, item.unitsPerPack) != null), [linesOf])
  const visible = useMemo(() => {
    const f = filter.trim().toLowerCase()
    return items.filter((i) => (!f || i.name.toLowerCase().includes(f) || i.detail.toLowerCase().includes(f) || i.barcodes.includes(filter.trim()))
      && (!onlyOpen || !isCounted(i)))
  }, [items, filter, onlyOpen, isCounted])
  const groups = useMemo(() => {
    const g = new Map<string, StockTakeItem[]>()
    for (const i of visible) g.set(i.group, [...(g.get(i.group) ?? []), i])
    return [...g.entries()]
  }, [visible])
  const countedTotal = items.filter(isCounted).length

  const focusItem = useCallback((key: string) => {
    setExpanded(key)
    setTimeout(() => document.getElementById(`st-${key}`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 50)
  }, [])

  const [search, setSearch] = useState<{ q: string; items: StockTakeItem[]; loading: boolean } | null>(null)
  const runSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) return
    setSearch({ q, items: [], loading: true })
    try {
      const res = await fetch(`/api/stock-take/${id}?q=${encodeURIComponent(q.trim())}`)
      const body = await res.json()
      const known = new Set(items.map((i) => i.key))
      setSearch({ q, items: ((body.items ?? []) as StockTakeItem[]).filter((i) => !known.has(i.key)).slice(0, 20), loading: false })
    } catch {
      setSearch({ q, items: [], loading: false })
    }
  }, [id, items])
  function addFound(item: StockTakeItem) {
    setExtra((prev) => [{ ...item, group: "Found on this shelf" }, ...prev])
    setSearch(null)
    setFilter("")
    focusItem(item.key)
  }

  const onScan = (e: BarcodeScanEvent) => {
    if (readOnly) return
    const code = e.gtin ?? e.raw
    const hit = items.find((i) => i.barcodes.includes(code) || i.barcodes.includes(e.raw) || barcodes[i.key] === code)
    if (hit) {
      focusItem(hit.key)
      if (e.batchNumber || e.expiryDate) {
        const bn = e.batchNumber?.toLowerCase()
        const known = bn ? hit.batches.find((b) => b.batchNumber.toLowerCase() === bn) : undefined
        const already = bn ? (linesOf.get(hit.key) ?? []).find((d) => !d.batchId && d.batchNumber.toLowerCase() === bn) : undefined
        if (!known && !already) {
          const exp = e.expiryDate ? `${e.expiryDate.getFullYear()}-${String(e.expiryDate.getMonth() + 1).padStart(2, "0")}` : ""
          addBatch(hit, { batchNumber: e.batchNumber ?? "", expiry: exp })
          toast.success(`${hit.name}: batch ${e.batchNumber ?? ""} added — enter how many`)
        }
      }
      return
    }
    const open = expanded ? itemByKey.get(expanded) : null
    if (open && open.barcodes.length === 0 && !barcodes[open.key]) {
      toast(`Barcode ${code} isn't known yet`, {
        action: { label: `Use for ${open.name.slice(0, 24)}`, onClick: () => { setBarcodes((b) => ({ ...b, [open.key]: code })); markDirty((linesOf.get(open.key) ?? []).map((d) => d.id)) } },
      })
      return
    }
    setFilter(code)
    void runSearch(code)
  }
  useBarcodeScanner({ onScan, enabled: !readOnly })

  // ── Review / post ──────────────────────────────────────────────────────────
  const [view, setView] = useState<"count" | "review">("count")
  const [posting, setPosting] = useState(false)
  async function openReview() {
    const done = await flush()
    if (!done) {
      const noExpiry = Object.values(drafts).some((d) => !d.batchId && countedOf(d, itemByKey.get(d.itemKey)?.unitsPerPack ?? 1) != null && !expiryMonthEnd(d.expiry))
      toast.error(noExpiry ? "Add the expiry month for every batch you found." : "Some counts haven't saved yet. Check your connection and try again.")
      return
    }
    await qc.invalidateQueries({ queryKey: ["stock-take-preview", id] })
    setView("review")
    window.scrollTo({ top: 0 })
  }
  async function post() {
    setPosting(true)
    try {
      const res = await fetch(`/api/stock-take/${id}/post`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "post" }) })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? "Couldn't post")
      if (body.status === "review") toast.success("Sent for approval. An owner or manager will find it under Stock take.")
      else toast.success(data?.session.kind === "setup" ? "Added to your stock" : "Stock updated")
      await qc.invalidateQueries({ queryKey: ["stock-take"] })
      await qc.invalidateQueries({ queryKey: ["stock-take-session", id] })
      router.push("/inventory/stock-take")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't post")
    } finally {
      setPosting(false)
    }
  }
  async function cancel() {
    if (!(await confirm("Nothing you counted here will change your stock.", { title: "Cancel this stock take?", confirmLabel: "Cancel it", destructive: true }))) return
    const res = await fetch(`/api/stock-take/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancel" }) })
    if (!res.ok) { toast.error("Couldn't cancel"); return }
    await qc.invalidateQueries({ queryKey: ["stock-take"] })
    router.push("/inventory/stock-take")
  }

  if (isLoading || (data && !loaded)) return <div className="py-24 flex justify-center"><Loader2 className="animate-spin text-[var(--pt-text-tertiary)]" /></div>
  if (error || !data) return <p className="py-16 text-center text-sm text-[var(--pt-red)]">{error instanceof Error ? error.message : "Not found"}</p>
  const s = data.session
  const setup = s.kind === "setup"

  if (view === "review") {
    return (
      <div className="max-w-4xl mx-auto pb-10">
        <ReviewPanel id={id} kind={s.kind} status={s.status} canAdjust={data.can.adjust} posting={posting} onBack={() => setView("count")} onPost={post} />
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-start gap-3 mb-4">
        <Link href="/inventory/stock-take" aria-label="Back to shelves" className="w-8 h-8 mt-0.5 rounded-md flex items-center justify-center text-[var(--pt-text-secondary)] hover:bg-[var(--pt-muted-strong)]">
          <ArrowLeft size={16} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight truncate">{s.title}</h1>
          <p className="text-sm text-[var(--pt-text-secondary)] mt-0.5">
            {setup ? "Enter what's on the shelf and confirm each price. Skip anything you don't stock." : s.hide_expected && s.status === "draft" ? "Count what's on the shelf. Recorded quantities stay hidden until you review." : "Count what's on the shelf."}
          </p>
        </div>
        {!readOnly && (
          <button onClick={cancel} className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-semibold text-[var(--pt-text-secondary)] hover:bg-[var(--pt-muted)] hover:text-[var(--pt-red)]">
            <XCircle size={14} /> Cancel
          </button>
        )}
      </div>

      {s.status === "review" && (
        <div className="flex gap-2 rounded-lg border border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10 p-3 text-sm mb-4">
          <ShieldAlert size={16} className="text-blue-600 shrink-0 mt-0.5" />
          <span className="flex-1">{data.can.adjust ? "This count is waiting for your approval." : "Waiting for an owner or manager to approve. Changing a count sends it back to counting."}</span>
          {data.can.adjust && <button onClick={openReview} className="font-semibold text-blue-700 dark:text-blue-300 hover:underline">Review</button>}
        </div>
      )}
      {readOnly && (
        <div className="rounded-lg border border-[var(--pt-border)] bg-[var(--pt-muted)] p-3 text-sm mb-4">
          {s.status === "posted" ? "This stock take is finished and has updated your stock." : "This stock take was cancelled."}{" "}
          <a href={`/api/stock-take/${id}/report`} className="font-semibold text-[var(--pt-green-600)] hover:underline">Download CSV</a>
        </div>
      )}

      <div className="sticky top-0 z-20 -mx-4 px-4 py-2 bg-[var(--pt-bg)] border-b border-[var(--pt-border)] mb-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--pt-text-tertiary)]" />
            <input value={filter} onChange={(e) => { setFilter(e.target.value); setSearch(null) }} placeholder="Filter this shelf, or scan a barcode"
              aria-label="Filter this shelf" className="w-full h-10 pl-9 pr-8 rounded-lg border border-[var(--pt-border)] bg-[var(--pt-surface)] text-sm" />
            {filter && <button onClick={() => { setFilter(""); setSearch(null) }} aria-label="Clear filter" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[var(--pt-text-tertiary)]"><X size={14} /></button>}
          </div>
          <button onClick={() => setOnlyOpen((v) => !v)} aria-pressed={onlyOpen}
            className={`h-10 px-3 rounded-lg border text-sm font-semibold whitespace-nowrap ${onlyOpen ? "border-[var(--pt-green)] bg-[var(--pt-green-50)] text-[var(--pt-green-600)]" : "border-[var(--pt-border)] bg-[var(--pt-surface)]"}`}>
            Not counted
          </button>
        </div>
        <div className="flex items-center justify-between mt-2 text-xs text-[var(--pt-text-secondary)]">
          <span className="inline-flex items-center gap-1.5"><ScanLine size={13} /> Scan a pack to jump to it</span>
          <SaveBadge state={save} />
        </div>
      </div>

      {filter.trim().length >= 2 && !readOnly && (
        <div className="mb-4 rounded-xl border border-dashed border-[var(--pt-border)] p-3">
          {!search || search.q !== filter ? (
            <button onClick={() => runSearch(filter)} className="text-sm font-semibold text-[var(--pt-green-600)] hover:underline text-left">
              Not on this shelf? Search all products and the catalogue for &ldquo;{filter}&rdquo;
            </button>
          ) : search.loading ? (
            <span className="text-sm text-[var(--pt-text-secondary)] inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Searching…</span>
          ) : search.items.length === 0 ? (
            <span className="text-sm text-[var(--pt-text-secondary)]">Nothing else matches &ldquo;{filter}&rdquo;. You can add it from the Products page.</span>
          ) : (
            <div>
              <div className="text-xs font-semibold text-[var(--pt-text-secondary)] mb-2">Add to this count</div>
              <ul className="space-y-1">
                {search.items.map((i) => (
                  <li key={i.key}>
                    <button onClick={() => addFound(i)} className="w-full flex items-center gap-2 text-left px-3 py-2 rounded-lg hover:bg-[var(--pt-muted)]">
                      <Plus size={14} className="text-[var(--pt-green-600)] shrink-0" />
                      <span className="text-sm font-medium">{i.name}</span>
                      <span className="text-xs text-[var(--pt-text-tertiary)] truncate">{i.detail}{i.productId ? "" : " · from catalogue"}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {groups.length === 0 ? (
        <p className="py-12 text-center text-sm text-[var(--pt-text-secondary)]">{onlyOpen ? "Everything here is counted." : "Nothing on this shelf matches."}</p>
      ) : groups.map(([group, list]) => (
        <section key={group} className="mb-4">
          <h2 className="flex items-center justify-between px-1 py-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--pt-text-secondary)]">
            <span>{group}</span><span className="tabular-nums normal-case">{list.filter(isCounted).length}/{list.length}</span>
          </h2>
          <ul className="rounded-xl border border-[var(--pt-border)] bg-[var(--pt-surface)] divide-y divide-[var(--pt-border)]">
            {list.map((item) => (
              <ItemRow key={item.key} item={item} lines={linesOf.get(item.key) ?? []} price={prices[item.key]}
                barcode={barcodes[item.key]} open={expanded === item.key} readOnly={readOnly} setup={setup}
                showExpected={!(s.hide_expected && s.status === "draft")} canViewCost={data.can.viewCost}
                onToggle={() => setExpanded(expanded === item.key ? null : item.key)}
                batchDraft={(bid) => batchDraft(item, bid)} onChange={changeDraft} onAdd={() => addBatch(item)}
                onRemove={removeDraft} onNone={() => noneOnShelf(item)} onPrice={(p) => setPrice(item, p)} />
            ))}
          </ul>
        </section>
      ))}

      {setup && !all && !readOnly && (
        <button onClick={() => { setAll(true); setLoaded(true) }} className="text-sm font-semibold text-[var(--pt-green-600)] hover:underline">
          Show every registered medicine for this shelf (PPB register)
        </button>
      )}

      {!readOnly && (
        <div className="sticky bottom-0 z-30 -mx-4 mt-6 border-t border-[var(--pt-border)] bg-[var(--pt-surface)]">
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold tabular-nums">{countedTotal} of {items.length} counted</div>
              <div className="h-1.5 rounded-full bg-[var(--pt-muted-strong)] mt-1.5 overflow-hidden">
                <div className="h-full bg-[var(--pt-green)] transition-all" style={{ width: `${items.length ? Math.round((countedTotal / items.length) * 100) : 0}%` }} />
              </div>
            </div>
            <button onClick={openReview} disabled={countedTotal === 0}
              className="h-11 px-5 rounded-lg bg-[var(--pt-green)] text-white text-sm font-semibold hover:bg-[var(--pt-green-600)] disabled:opacity-50">
              Review
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function SaveBadge({ state }: { state: "idle" | "saving" | "saved" | "error" }) {
  if (state === "saving") return <span className="inline-flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Saving…</span>
  if (state === "error") return <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300"><CloudOff size={12} /> Not saved yet — will retry</span>
  if (state === "saved") return <span className="inline-flex items-center gap-1 text-[var(--pt-green-600)]"><Check size={12} /> Saved</span>
  return <span />
}

// Enter moves to the next count box, so a shelf can be keyed without the mouse.
function nextOnEnter(e: React.KeyboardEvent<HTMLInputElement>) {
  if (e.key !== "Enter") return
  e.preventDefault()
  const boxes = [...document.querySelectorAll<HTMLInputElement>("input[data-count]")]
  boxes[boxes.indexOf(e.currentTarget) + 1]?.focus()
}

function ItemRow({ item, lines, price, barcode, open, readOnly, setup, showExpected, canViewCost, onToggle, batchDraft, onChange, onAdd, onRemove, onNone, onPrice }: {
  item: StockTakeItem; lines: Draft[]; price: Price | undefined; barcode: string | undefined; open: boolean; readOnly: boolean
  setup: boolean; showExpected: boolean; canViewCost: boolean
  onToggle: () => void; batchDraft: (batchId: string) => Draft; onChange: (d: Draft) => void; onAdd: () => void
  onRemove: (d: Draft) => void; onNone: () => void; onPrice: (p: Price) => void
}) {
  const upp = Math.max(1, item.unitsPerPack)
  const total = lines.reduce((sum, d) => sum + (countedOf(d, upp) ?? 0), 0)
  const counted = lines.some((d) => countedOf(d, upp) != null)
  const found = lines.filter((d) => !d.batchId)
  const recorded = item.batches.reduce((sum, b) => sum + (b.qty ?? 0), 0)
  const sell = price ? num(price.sell) : null
  const showPrice = item.needsPrice && (setup || !!item.productId)
  const amount = (units: number) => {
    const { packs, loose } = splitUnits(units, upp)
    return upp > 1 ? `${packs} ${item.packLabel ?? "pack"}${packs === 1 ? "" : "s"}${loose ? ` + ${loose}` : ""}` : `${units} ${item.baseUnit}${units === 1 ? "" : "s"}`
  }

  return (
    <li id={`st-${item.key}`} className="scroll-mt-32">
      <button onClick={onToggle} aria-expanded={open} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--pt-muted)]">
        <span className={`size-5 rounded-full border flex items-center justify-center shrink-0 ${counted ? "bg-[var(--pt-green)] border-[var(--pt-green)] text-white" : "border-[var(--pt-border)]"}`}>
          {counted && <Check size={12} strokeWidth={3} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold truncate">{item.name}</span>
          <span className="block text-xs text-[var(--pt-text-tertiary)] truncate">
            {item.detail}
            {item.controlled && <span className="ml-1.5 font-semibold text-blue-600 dark:text-blue-400">Controlled</span>}
            {showPrice && (counted || !setup) && !(sell && sell > 0) && <span className="ml-1.5 font-semibold text-amber-700 dark:text-amber-300">Needs price</span>}
          </span>
        </span>
        <span className="text-right text-xs tabular-nums shrink-0">
          {counted ? <span className="font-semibold">{amount(total)}</span> : <span className="text-[var(--pt-text-tertiary)]">Not counted</span>}
          {showExpected && item.batches.length > 0 && <span className="block text-[var(--pt-text-tertiary)]">Recorded {amount(recorded)}</span>}
        </span>
        <ChevronDown size={16} className={`text-[var(--pt-text-tertiary)] transition-transform shrink-0 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 space-y-3 bg-[var(--pt-muted)]">
          {item.batches.map((b) => {
            const d = batchDraft(b.id)
            return (
              <div key={b.id} className="flex flex-wrap items-end gap-3">
                <div className="min-w-[8rem] flex-1">
                  <div className="text-xs font-semibold">Batch {b.batchNumber}</div>
                  <div className="text-xs text-[var(--pt-text-tertiary)]">Expires {monthLabel(b.expiry)}{showExpected && b.qty != null ? ` · recorded ${amount(b.qty)}` : ""}</div>
                </div>
                <QtyInputs draft={d} item={item} disabled={readOnly} onChange={onChange} />
              </div>
            )
          })}
          {found.map((d) => (
            <div key={d.id} className="flex flex-wrap items-end gap-3 rounded-lg border border-dashed border-[var(--pt-border)] bg-[var(--pt-surface)] p-2">
              <label className="text-xs">
                <span className="block font-semibold mb-1">Batch no. <span className="font-normal text-[var(--pt-text-tertiary)]">(optional)</span></span>
                <input data-count disabled={readOnly} value={d.batchNumber} onKeyDown={nextOnEnter} onChange={(e) => onChange({ ...d, batchNumber: e.target.value })}
                  className="h-9 w-32 px-2 rounded-md border border-[var(--pt-border)] bg-[var(--pt-surface)] text-sm" />
              </label>
              <label className="text-xs">
                <span className="block font-semibold mb-1">Expiry month</span>
                <input data-count type="month" disabled={readOnly} value={d.expiry} onKeyDown={nextOnEnter} onChange={(e) => onChange({ ...d, expiry: e.target.value })}
                  aria-invalid={countedOf(d, upp) != null && !expiryMonthEnd(d.expiry)}
                  className="h-9 w-40 px-2 rounded-md border border-[var(--pt-border)] bg-[var(--pt-surface)] text-sm aria-[invalid=true]:border-[var(--pt-red)]" />
              </label>
              <QtyInputs draft={d} item={item} disabled={readOnly} onChange={onChange} />
              {!readOnly && (
                <button onClick={() => onRemove(d)} aria-label="Remove this batch" className="h-9 w-9 flex items-center justify-center rounded-md text-[var(--pt-text-tertiary)] hover:text-[var(--pt-red)] hover:bg-[var(--pt-muted)]">
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          ))}

          {showPrice && (
            <div className="flex flex-wrap items-end gap-3 rounded-lg bg-[var(--pt-surface)] border border-[var(--pt-border)] p-3">
              <label className="text-xs">
                <span className="block font-semibold mb-1">Selling price per {item.baseUnit} (KES)</span>
                <input data-count inputMode="decimal" disabled={readOnly} value={price?.sell ?? ""} placeholder="0.00" onKeyDown={nextOnEnter}
                  onChange={(e) => onPrice({ sell: e.target.value.replace(/[^0-9.]/g, ""), costPack: price?.costPack ?? "" })}
                  className="h-9 w-32 px-2 rounded-md border border-[var(--pt-border)] bg-[var(--pt-surface)] text-sm tabular-nums" />
              </label>
              {item.suggestedSell != null && !(sell && sell > 0) && !readOnly && (
                <button onClick={() => onPrice({ sell: String(item.suggestedSell), costPack: price?.costPack || (item.suggestedCost != null ? String(Math.round(item.suggestedCost * upp * 100) / 100) : "") })}
                  className="h-9 px-3 rounded-md border border-[var(--pt-border)] bg-[var(--pt-green-50)] text-[var(--pt-green-600)] text-xs font-semibold">
                  Use KES {item.suggestedSell.toLocaleString("en-KE")}
                </button>
              )}
              {canViewCost && (
                <label className="text-xs">
                  <span className="block font-semibold mb-1">Cost per {item.packLabel ?? "pack"} (KES)</span>
                  <input data-count inputMode="decimal" disabled={readOnly} value={price?.costPack ?? ""} placeholder={item.suggestedCost != null ? String(Math.round(item.suggestedCost * upp * 100) / 100) : "0.00"} onKeyDown={nextOnEnter}
                    onChange={(e) => onPrice({ sell: price?.sell ?? "", costPack: e.target.value.replace(/[^0-9.]/g, "") })}
                    className="h-9 w-32 px-2 rounded-md border border-[var(--pt-border)] bg-[var(--pt-surface)] text-sm tabular-nums" />
                </label>
              )}
              <span className={`text-xs pb-2 ${sell && sell > 0 ? "text-[var(--pt-green-600)] font-semibold" : "text-[var(--pt-text-tertiary)]"}`}>
                {sell && sell > 0 ? "Price confirmed" : item.suggestedSell != null ? "Suggested price — confirm it or type your own" : "Type your price"}
              </span>
            </div>
          )}

          {barcode && <div className="text-xs text-[var(--pt-text-secondary)]">Barcode {barcode} will be saved on this product.</div>}

          {!readOnly && (
            <div className="flex flex-wrap gap-2">
              <button onClick={onAdd} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-[var(--pt-border)] bg-[var(--pt-surface)] text-xs font-semibold hover:border-[var(--pt-green)]">
                <Plus size={13} /> {item.batches.length || found.length ? "Another batch" : "Add what's on the shelf"}
              </button>
              {item.batches.length > 0 && (
                <button onClick={onNone} className="h-8 px-3 rounded-md border border-[var(--pt-border)] bg-[var(--pt-surface)] text-xs font-semibold hover:border-[var(--pt-red)]">
                  None on shelf
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  )
}

function QtyInputs({ draft, item, disabled, onChange }: { draft: Draft; item: StockTakeItem; disabled: boolean; onChange: (d: Draft) => void }) {
  const upp = Math.max(1, item.unitsPerPack)
  const cls = "h-9 w-20 px-2 rounded-md border border-[var(--pt-border)] bg-[var(--pt-surface)] text-sm tabular-nums"
  const clean = (v: string) => v.replace(/[^0-9]/g, "").slice(0, 7)
  if (upp === 1) {
    return (
      <label className="text-xs">
        <span className="block font-semibold mb-1 capitalize">{item.baseUnit}s</span>
        <input data-count inputMode="numeric" disabled={disabled} value={draft.packs} placeholder="0" onKeyDown={nextOnEnter}
          onChange={(e) => onChange({ ...draft, packs: clean(e.target.value), loose: "" })} className={cls} aria-label={`${item.name} quantity`} />
      </label>
    )
  }
  return (
    <div className="flex items-end gap-2">
      <label className="text-xs">
        <span className="block font-semibold mb-1 capitalize">{item.packLabel ?? "Packs"}<span className="font-normal text-[var(--pt-text-tertiary)]"> ×{upp}</span></span>
        <input data-count inputMode="numeric" disabled={disabled} value={draft.packs} placeholder="0" onKeyDown={nextOnEnter}
          onChange={(e) => onChange({ ...draft, packs: clean(e.target.value) })} className={cls} aria-label={`${item.name} full packs`} />
      </label>
      <span className="pb-2 text-[var(--pt-text-tertiary)]">+</span>
      <label className="text-xs">
        <span className="block font-semibold mb-1">Loose {item.baseUnit}s</span>
        <input data-count inputMode="numeric" disabled={disabled} value={draft.loose} placeholder="0" onKeyDown={nextOnEnter}
          onChange={(e) => onChange({ ...draft, loose: clean(e.target.value) })} className={cls} aria-label={`${item.name} loose ${item.baseUnit}s`} />
      </label>
    </div>
  )
}
