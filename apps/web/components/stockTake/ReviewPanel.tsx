"use client"

import { useQuery } from "@tanstack/react-query"
import { AlertTriangle, ArrowLeft, CheckCircle2, Download, Loader2, ShieldAlert } from "lucide-react"

// The review step of a stock take (ADR-020): only what will change — found,
// missing, new batches, new products — with the reason it needs approval.

interface Row {
  id: string; kind: "batch" | "new_batch" | "new_product"; name: string; controlled: boolean
  batch_number: string | null; expiry: string | null; expected: number | null; counted: number; delta: number
  value: number | null; price: number | null
}
interface Preview {
  summary: {
    counted: number; changed: number; unitsFound: number; unitsMissing: number; valueFound: number | null; valueMissing: number | null
    newBatches: number; newProducts: number; unpriced: number; approvalReasons: string[]
  }
  pricesSet: number; skipped: number; rows: Row[]; needsApproval: boolean
}

const kes = (n: number) => `KES ${n.toLocaleString("en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
const month = (d: string | null) => (d ? new Date(`${d}T12:00:00+03:00`).toLocaleDateString("en-KE", { month: "short", year: "numeric" }) : "—")

export function ReviewPanel({ id, kind, status, canAdjust, posting, onBack, onPost }: {
  id: string; kind: "count" | "setup"; status: string; canAdjust: boolean; posting: boolean
  onBack: () => void; onPost: () => void
}) {
  const { data, isLoading, error } = useQuery<Preview>({
    queryKey: ["stock-take-preview", id],
    queryFn: async () => {
      const res = await fetch(`/api/stock-take/${id}/post`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "preview" }) })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? "Couldn't load the review")
      return body
    },
  })
  if (isLoading) return <div className="py-16 flex justify-center"><Loader2 className="animate-spin text-[var(--pt-text-tertiary)]" /></div>
  if (error || !data) return <p className="py-10 text-center text-sm text-[var(--pt-red)]">{error instanceof Error ? error.message : "Couldn't load the review"}</p>

  const s = data.summary
  const changes = data.rows.filter((r) => r.kind !== "batch" || r.delta !== 0)
  const matched = data.rows.filter((r) => r.kind === "batch" && r.delta === 0).length
  const approvalNeeded = data.needsApproval
  const label = status === "review" && canAdjust ? "Approve and post" : approvalNeeded ? "Send for approval" : kind === "setup" ? "Add to my stock" : "Post the count"

  return (
    <div>
      <button onClick={onBack} className="inline-flex items-center gap-1 text-sm text-[var(--pt-text-secondary)] hover:text-[var(--pt-text)] mb-4">
        <ArrowLeft size={14} /> Back to counting
      </button>
      <h2 className="text-xl font-bold">Check before you post</h2>
      <p className="text-sm text-[var(--pt-text-secondary)] mt-1">{s.counted} line{s.counted === 1 ? "" : "s"} counted{matched ? ` · ${matched} matched the records` : ""}.</p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 my-5">
        {kind === "count" ? (
          <>
            <Stat label="Found (more than recorded)" value={`+${s.unitsFound}`} sub={s.valueFound != null ? kes(s.valueFound) : undefined} tone="green" />
            <Stat label="Missing (less than recorded)" value={`−${s.unitsMissing}`} sub={s.valueMissing != null ? kes(s.valueMissing) : undefined} tone={s.unitsMissing ? "red" : undefined} />
            <Stat label="Batches found" value={String(s.newBatches)} />
            <Stat label="Batches corrected" value={String(s.changed)} />
          </>
        ) : (
          <>
            <Stat label="New products" value={String(s.newProducts)} tone="green" />
            <Stat label="Batches added" value={String(data.rows.filter((r) => r.kind !== "batch" && r.counted > 0).length)} />
            <Stat label="Prices confirmed" value={String(s.newProducts - s.unpriced + data.pricesSet)} />
            <Stat label="Need a price" value={String(s.unpriced)} tone={s.unpriced ? "amber" : undefined} />
          </>
        )}
      </div>

      {s.unpriced > 0 && (
        <div className="flex gap-2 rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-3 text-sm mb-4">
          <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
          <span>{s.unpriced} product{s.unpriced === 1 ? " has" : "s have"} no confirmed price. {s.unpriced === 1 ? "It" : "They"}&apos;ll be added with the stock but stay off sale until you set a price on the Products page.</span>
        </div>
      )}
      {approvalNeeded && (
        <div className="flex gap-2 rounded-lg border border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10 p-3 text-sm mb-4">
          <ShieldAlert size={16} className="text-blue-600 shrink-0 mt-0.5" />
          <span>An owner or manager needs to approve this: {s.approvalReasons.join("; ")}.</span>
        </div>
      )}
      {data.skipped > 0 && <p className="text-xs text-[var(--pt-text-secondary)] mb-3">{data.skipped} line{data.skipped === 1 ? " was" : "s were"} skipped because the batch no longer exists here.</p>}

      {changes.length > 0 ? (
        <div className="rounded-xl border border-[var(--pt-border)] bg-[var(--pt-surface)] overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-[var(--pt-text-secondary)] border-b border-[var(--pt-border)]">
              <tr>
                <th className="px-4 py-2 font-semibold">Product</th>
                <th className="px-3 py-2 font-semibold">Batch</th>
                {kind === "count" && <th className="px-3 py-2 font-semibold text-right">Recorded</th>}
                <th className="px-3 py-2 font-semibold text-right">Counted</th>
                <th className="px-4 py-2 font-semibold text-right">{kind === "count" ? "Difference" : "Price"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--pt-border)]">
              {changes.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2">
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-[var(--pt-text-tertiary)]">
                      {r.kind === "new_product" ? "New product" : r.kind === "new_batch" ? "Batch found" : ""}{r.controlled ? " · Controlled" : ""}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs">{r.batch_number ?? "—"}<div className="text-[var(--pt-text-tertiary)]">{month(r.expiry)}</div></td>
                  {kind === "count" && <td className="px-3 py-2 text-right tabular-nums">{r.expected ?? "—"}</td>}
                  <td className="px-3 py-2 text-right tabular-nums">{r.counted}</td>
                  <td className={`px-4 py-2 text-right tabular-nums font-semibold ${kind === "count" ? (r.delta < 0 ? "text-[var(--pt-red)]" : "text-[var(--pt-green-600)]") : ""}`}>
                    {kind === "count" ? `${r.delta > 0 ? "+" : ""}${r.delta}` : r.price != null ? kes(r.price) : r.kind === "new_product" ? <span className="text-amber-700 dark:text-amber-300 font-normal">Needs price</span> : "—"}
                    {kind === "count" && r.value != null && r.value > 0 && <div className="text-xs font-normal text-[var(--pt-text-tertiary)]">{kes(r.value)}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--pt-border)] bg-[var(--pt-surface)] p-6 text-center text-sm">
          <CheckCircle2 className="mx-auto text-[var(--pt-green)] mb-2" />
          Everything you counted matches the records.
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2 mt-5">
        <a href={`/api/stock-take/${id}/report`} className="inline-flex items-center gap-2 h-10 px-4 rounded-lg border border-[var(--pt-border)] text-sm font-semibold hover:bg-[var(--pt-muted)]">
          <Download size={15} /> CSV
        </a>
        <button onClick={onPost} disabled={posting || s.counted === 0}
          className="inline-flex items-center gap-2 h-10 px-5 rounded-lg bg-[var(--pt-green)] text-white text-sm font-semibold hover:bg-[var(--pt-green-600)] disabled:opacity-60">
          {posting && <Loader2 size={15} className="animate-spin" />} {label}
        </button>
      </div>
    </div>
  )
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "green" | "red" | "amber" }) {
  const color = tone === "green" ? "text-[var(--pt-green-600)]" : tone === "red" ? "text-[var(--pt-red)]" : tone === "amber" ? "text-amber-600" : ""
  return (
    <div className="rounded-xl border border-[var(--pt-border)] bg-[var(--pt-surface)] px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--pt-text-secondary)]">{label}</div>
      <div className={`text-xl font-bold tabular-nums mt-0.5 ${color}`}>{value}</div>
      {sub && <div className="text-xs text-[var(--pt-text-tertiary)]">{sub}</div>}
    </div>
  )
}
