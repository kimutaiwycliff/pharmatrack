"use client"

import { Sheet, SheetContent } from "@/components/ui/sheet"
import { useQuery } from "@tanstack/react-query"
import { Layers, X } from "lucide-react"
import { formatKES } from "@/lib/store/cartStore"
import type { ProductStock, ProductBatch } from "@pharmatrack/types"

interface Props {
  open: boolean
  product: ProductStock | null
  branchId: string
  onClose: () => void
}

function daysUntil(dateStr: string) {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000)
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

export function BatchesSheet({ open, product, branchId, onClose }: Props) {
  const { data: batches, isLoading } = useBatches(product?.product_id ?? null, branchId)

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
            <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center text-[var(--pt-text-secondary)]">
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
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 text-[var(--pt-text-secondary)]"
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
              <div key={label} className="bg-gray-50 px-4 py-3">
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
                <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
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
                        <span className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-[10px] font-bold text-[var(--pt-text-secondary)]">
                          {i + 1}
                        </span>
                        <div>
                          <p className="text-sm font-bold font-mono tracking-wide">
                            {b.batch_number}
                          </p>
                          <p className={`text-xs mt-0.5 font-medium ${expired ? "text-[var(--pt-red)]" : expiring ? "text-[var(--pt-amber)]" : "text-[var(--pt-text-secondary)]"}`}>
                            Exp{" "}
                            {new Date(b.expiry_date).toLocaleDateString("en-KE", {
                              day: "numeric", month: "short", year: "numeric",
                            })}
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
                        <p className="font-semibold mt-0.5">
                          {new Date(b.received_at).toLocaleDateString("en-KE", {
                            day: "numeric", month: "short", year: "numeric",
                          })}
                        </p>
                      </div>
                      <div>
                        <p className="text-[var(--pt-text-tertiary)] uppercase tracking-wide text-[10px] font-semibold">
                          Progress
                        </p>
                        <div className="mt-1.5 h-1.5 rounded-full bg-gray-200 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-[var(--pt-green)]"
                            style={{
                              width: `${Math.round((b.quantity_remaining / b.quantity_received) * 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
