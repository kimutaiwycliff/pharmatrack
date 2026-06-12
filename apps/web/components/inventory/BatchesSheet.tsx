"use client"

import { useState } from "react"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Layers, X, SlidersHorizontal, History, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { formatKES } from "@/lib/store/cartStore"
import { useSessionStore } from "@/lib/store/sessionStore"
import type { ProductStock, ProductBatch, StockAdjustmentReason } from "@pharmatrack/types"

interface Props {
  open: boolean
  product: ProductStock | null
  branchId: string
  onClose: () => void
}

interface AdjustmentRow {
  id: string
  delta: number
  quantity_before: number
  quantity_after: number
  reason: StockAdjustmentReason
  note: string | null
  created_at: string
  adjusted_by_profile: { full_name: string } | null
}

// Each reason drives how the quantity input behaves: a downward write-off, an
// upward return, or an absolute re-count.
const REASONS: Record<
  StockAdjustmentReason,
  { label: string; mode: "set" | "delta"; sign: 1 | -1; verb: string }
> = {
  count_correction: { label: "Count correction", mode: "set", sign: 1, verb: "Counted quantity" },
  damage:           { label: "Damage / breakage", mode: "delta", sign: -1, verb: "Units removed" },
  expiry:           { label: "Expired write-off", mode: "delta", sign: -1, verb: "Units removed" },
  theft_loss:       { label: "Theft / loss",      mode: "delta", sign: -1, verb: "Units removed" },
  return:           { label: "Customer return",   mode: "delta", sign: 1,  verb: "Units returned" },
  other:            { label: "Other",             mode: "set",   sign: 1,  verb: "New quantity" },
}

function daysUntil(dateStr: string) {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000)
}

function fmtDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-KE", {
    day: "numeric", month: "short", year: "numeric",
  })
}

function useBatches(productId: string | null, branchId: string) {
  return useQuery<ProductBatch[]>({
    queryKey: ["batches", productId, branchId],
    queryFn: async () => {
      const res = await fetch(
        `/api/batches?product_id=${productId}&branch_id=${branchId}`,
      )
      if (!res.ok) throw new Error("Failed to fetch batches")
      const json = (await res.json()) as { batches: ProductBatch[] }
      return json.batches
    },
    enabled: !!productId && !!branchId,
    staleTime: 30_000,
  })
}

function AdjustPanel({
  batch,
  productId,
  branchId,
  onDone,
}: {
  batch: ProductBatch
  productId: string
  branchId: string
  onDone: () => void
}) {
  const qc = useQueryClient()
  const [reason, setReason] = useState<StockAdjustmentReason>("count_correction")
  const [qty, setQty] = useState<string>(String(batch.quantity_remaining))
  const [note, setNote] = useState("")

  const cfg = REASONS[reason]
  const value = parseInt(qty || "", 10)
  const hasValue = qty !== "" && !Number.isNaN(value) && value >= 0
  const newRemaining = !hasValue
    ? batch.quantity_remaining
    : cfg.mode === "set"
      ? value
      : batch.quantity_remaining + cfg.sign * value
  const changed = newRemaining !== batch.quantity_remaining
  const wouldGoNegative = newRemaining < 0

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/inventory/adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batch_id: batch.id,
          mode: cfg.mode,
          value: cfg.mode === "set" ? value : cfg.sign * value,
          reason,
          note: note.trim() || undefined,
        }),
      })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(json.error ?? "Adjustment failed")
    },
    onSuccess: () => {
      toast.success("Stock adjusted")
      void qc.invalidateQueries({ queryKey: ["batches", productId, branchId] })
      void qc.invalidateQueries({ queryKey: ["inventory"] })
      void qc.invalidateQueries({ queryKey: ["stock-adjustments", productId] })
      onDone()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <div className="mt-3 rounded-lg border border-[var(--pt-border)] bg-[var(--pt-muted)] p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] font-semibold text-[var(--pt-text-secondary)] uppercase tracking-wide mb-1">
            Reason
          </label>
          <select
            value={reason}
            onChange={(e) => {
              const next = e.target.value as StockAdjustmentReason
              setReason(next)
              // Reset the input to a sensible default for the new mode.
              setQty(REASONS[next].mode === "set" ? String(batch.quantity_remaining) : "")
            }}
            className="w-full h-9 px-3 border border-[var(--pt-border)] rounded-lg text-sm bg-[var(--pt-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--pt-green)] focus:border-transparent"
          >
            {(Object.keys(REASONS) as StockAdjustmentReason[]).map((r) => (
              <option key={r} value={r}>{REASONS[r].label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-[var(--pt-text-secondary)] uppercase tracking-wide mb-1">
            {cfg.verb}
          </label>
          <input
            type="number"
            min={0}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="w-full h-9 px-3 border border-[var(--pt-border)] rounded-lg text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-[var(--pt-green)] focus:border-transparent"
          />
        </div>
      </div>

      <div>
        <label className="block text-[11px] font-semibold text-[var(--pt-text-secondary)] uppercase tracking-wide mb-1">
          Note <span className="font-normal normal-case text-[var(--pt-text-tertiary)]">(optional)</span>
        </label>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. damaged in transit, stocktake on 12 Jun"
          maxLength={500}
          className="w-full h-9 px-3 border border-[var(--pt-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pt-green)] focus:border-transparent"
        />
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-[var(--pt-text-secondary)]">New stock for this batch</span>
        <span className={`font-bold tabular-nums ${wouldGoNegative ? "text-[var(--pt-red)]" : ""}`}>
          {batch.quantity_remaining} → {wouldGoNegative ? "—" : newRemaining}
        </span>
      </div>
      {wouldGoNegative && (
        <p className="text-xs text-[var(--pt-red)]">
          Cannot remove more than the {batch.quantity_remaining} remaining in this batch.
        </p>
      )}

      <div className="flex gap-2">
        <Button
          onClick={() => mutation.mutate()}
          disabled={!changed || wouldGoNegative || mutation.isPending}
          className="flex-1 h-9 gap-2 bg-[var(--pt-green)] hover:bg-[var(--pt-green-600)] text-white"
        >
          {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
          Save adjustment
        </Button>
        <Button
          variant="outline"
          onClick={onDone}
          disabled={mutation.isPending}
          className="h-9"
        >
          Cancel
        </Button>
      </div>
    </div>
  )
}

function AdjustmentHistory({ productId }: { productId: string }) {
  const { data, isLoading } = useQuery<AdjustmentRow[]>({
    queryKey: ["stock-adjustments", productId],
    queryFn: async () => {
      const res = await fetch(`/api/inventory/adjust?product_id=${productId}`)
      if (!res.ok) throw new Error("Failed to load history")
      const json = (await res.json()) as { adjustments: AdjustmentRow[] }
      return json.adjustments
    },
    staleTime: 15_000,
  })

  if (isLoading) {
    return <p className="text-xs text-[var(--pt-text-tertiary)] px-6 py-4">Loading history…</p>
  }
  if (!data || data.length === 0) {
    return <p className="text-xs text-[var(--pt-text-tertiary)] px-6 py-4">No adjustments recorded yet.</p>
  }

  return (
    <div className="divide-y divide-[var(--pt-border)]">
      {data.map((a) => (
        <div key={a.id} className="px-6 py-3 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium">
              {REASONS[a.reason]?.label ?? a.reason}
            </p>
            <p className="text-xs text-[var(--pt-text-secondary)] mt-0.5">
              {fmtDate(a.created_at)}
              {a.adjusted_by_profile?.full_name ? ` · ${a.adjusted_by_profile.full_name}` : ""}
            </p>
            {a.note && (
              <p className="text-xs text-[var(--pt-text-tertiary)] mt-0.5 italic">“{a.note}”</p>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className={`text-sm font-bold tabular-nums ${a.delta < 0 ? "text-[var(--pt-red)]" : "text-[var(--pt-green-600)]"}`}>
              {a.delta > 0 ? "+" : ""}{a.delta}
            </p>
            <p className="text-xs text-[var(--pt-text-tertiary)] tabular-nums mt-0.5">
              {a.quantity_before} → {a.quantity_after}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}

export function BatchesSheet({ open, product, branchId, onClose }: Props) {
  const { data: batches, isLoading } = useBatches(product?.product_id ?? null, branchId)
  const role = useSessionStore((s) => s.profile?.role)
  const canAdjust = role === "owner" || role === "manager"

  const [adjustingId, setAdjustingId] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)

  // Reset transient panels whenever a different product opens.
  const productId = product?.product_id ?? null

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-full sm:max-w-[520px] p-0 flex flex-col gap-0"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--pt-border)] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[var(--pt-muted-strong)] flex items-center justify-center text-[var(--pt-text-secondary)]">
              <Layers size={17} />
            </div>
            <div>
              <h2 className="text-base font-bold">{product?.name ?? "Batches"}</h2>
              <p className="text-xs text-[var(--pt-text-secondary)]">
                {product?.strength} · {product?.dosage_form}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--pt-muted-strong)] text-[var(--pt-text-secondary)]"
          >
            <X size={16} />
          </button>
        </div>

        {/* Stock summary */}
        {product && (
          <div className="grid grid-cols-3 gap-px bg-[var(--pt-border)] border-b border-[var(--pt-border)] shrink-0">
            {[
              { label: "In stock", value: `${product.stock_on_hand ?? 0} ${product.base_unit}` },
              { label: "Batches", value: String(product.batch_count ?? 0) },
              { label: "Sell price", value: product.selling_price != null ? formatKES(product.selling_price) : "—" },
            ].map(({ label, value }) => (
              <div key={label} className="bg-[var(--pt-muted)] px-4 py-3">
                <p className="text-[11px] font-semibold text-[var(--pt-text-secondary)] uppercase tracking-wide">
                  {label}
                </p>
                <p className="text-base font-bold mt-0.5 tabular-nums">{value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Batch list */}
        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="p-6 space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-20 bg-[var(--pt-muted-strong)] rounded-xl animate-pulse" />
              ))}
            </div>
          )}

          {!isLoading && (!batches || batches.length === 0) && (
            <div className="flex flex-col items-center justify-center h-48 text-[var(--pt-text-tertiary)] text-sm">
              No batches found for this branch
            </div>
          )}

          {!isLoading && batches && batches.length > 0 && (
            <div className="divide-y divide-[var(--pt-border)]">
              {batches.map((b, i) => {
                const days = daysUntil(b.expiry_date)
                const expired = days < 0
                const expiring = !expired && days <= 90
                return (
                  <div key={b.id} className="px-6 py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-[var(--pt-muted-strong)] flex items-center justify-center text-[10px] font-bold text-[var(--pt-text-secondary)]">
                          {i + 1}
                        </span>
                        <div>
                          <p className="text-sm font-bold font-mono tracking-wide">
                            {b.batch_number}
                          </p>
                          <p className={`text-xs mt-0.5 font-medium ${expired ? "text-[var(--pt-red)]" : expiring ? "text-[var(--pt-amber)]" : "text-[var(--pt-text-secondary)]"}`}>
                            Exp {fmtDate(b.expiry_date)}
                            {expired ? " (Expired)" : expiring ? ` · ${days}d left` : ""}
                          </p>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold tabular-nums">
                          {b.quantity_remaining}{" "}
                          <span className="text-xs text-[var(--pt-text-tertiary)] font-normal">
                            remaining
                          </span>
                        </p>
                        <p className="text-xs text-[var(--pt-text-tertiary)] tabular-nums mt-0.5">
                          of {b.quantity_received} received
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <p className="text-[var(--pt-text-tertiary)] uppercase tracking-wide text-[10px] font-semibold">
                          Cost/unit
                        </p>
                        <p className="font-semibold mt-0.5">
                          {b.cost_price != null ? formatKES(b.cost_price) : "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[var(--pt-text-tertiary)] uppercase tracking-wide text-[10px] font-semibold">
                          Received
                        </p>
                        <p className="font-semibold mt-0.5">{fmtDate(b.received_at)}</p>
                      </div>
                      <div>
                        <p className="text-[var(--pt-text-tertiary)] uppercase tracking-wide text-[10px] font-semibold">
                          Progress
                        </p>
                        <div className="mt-1.5 h-1.5 rounded-full bg-[var(--pt-border)] overflow-hidden">
                          <div
                            className="h-full rounded-full bg-[var(--pt-green)]"
                            style={{
                              width: `${Math.round((b.quantity_remaining / b.quantity_received) * 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    {canAdjust && (
                      adjustingId === b.id ? (
                        <AdjustPanel
                          batch={b}
                          productId={productId!}
                          branchId={branchId}
                          onDone={() => setAdjustingId(null)}
                        />
                      ) : (
                        <button
                          onClick={() => setAdjustingId(b.id)}
                          className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--pt-text-secondary)] hover:text-[var(--pt-text)] transition-colors"
                        >
                          <SlidersHorizontal size={13} />
                          Adjust stock
                        </button>
                      )
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Adjustment history */}
          {productId && (
            <div className="border-t border-[var(--pt-border)]">
              <button
                onClick={() => setShowHistory((v) => !v)}
                className="w-full flex items-center gap-2 px-6 py-3 text-xs font-semibold text-[var(--pt-text-secondary)] hover:bg-[var(--pt-muted)] transition-colors"
              >
                <History size={13} />
                {showHistory ? "Hide" : "Show"} adjustment history
              </button>
              {showHistory && <AdjustmentHistory productId={productId} />}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
