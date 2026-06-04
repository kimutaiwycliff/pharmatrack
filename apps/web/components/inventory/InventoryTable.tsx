"use client"

import { useState, useRef, useEffect } from "react"
import { MoreHorizontal, Layers, Pill, Pencil } from "lucide-react"
import { formatKES } from "@/lib/store/cartStore"
import { BatchesSheet } from "./BatchesSheet"
import { EditProductSheet } from "./EditProductSheet"
import type { ProductStock } from "@pharmatrack/types"

interface InventoryRow extends ProductStock {
  status_badges: string[]
  expiry_days: number | null
}

interface Props {
  products: InventoryRow[]
  branchId: string
  isLoading?: boolean
}

const BADGE_MAP: Record<string, { label: string; className: string }> = {
  out_of_stock: { label: "Out of stock", className: "bg-red-50 text-red-700 border-red-100" },
  low_stock:    { label: "Low stock",    className: "bg-amber-50 text-amber-700 border-amber-100" },
  expiring:     { label: "Expiring",     className: "bg-yellow-50 text-yellow-700 border-yellow-100" },
  controlled:   { label: "Controlled",   className: "bg-blue-50 text-blue-700 border-blue-100" },
  ok:           { label: "OK",           className: "bg-[var(--pt-green-50)] text-[var(--pt-green-600)] border-[var(--pt-green-100)]" },
}

function stockColor(stock: number, reorder: number) {
  if (stock === 0) return "text-[var(--pt-red)]"
  if (stock <= reorder) return "text-[var(--pt-amber)]"
  return "text-[var(--pt-text)]"
}

function ExpiryCell({ expiry, days }: { expiry: string | null; days: number | null }) {
  if (!expiry) return <span className="text-[var(--pt-text-tertiary)]">—</span>
  const fmt = new Date(expiry).toLocaleDateString("en-KE", {
    day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Nairobi",
  })
  return (
    <div>
      <p className="text-sm">{fmt}</p>
      {days !== null && days <= 90 && (
        <p className={`text-[11px] mt-0.5 font-medium ${days <= 30 ? "text-[var(--pt-amber)]" : "text-yellow-600"}`}>
          in {days}d
        </p>
      )}
    </div>
  )
}

function ActionMenu({ product, onBatches, onEdit }: {
  product: InventoryRow
  onBatches: () => void
  onEdit: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handle)
    return () => document.removeEventListener("mousedown", handle)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-7 h-7 rounded-md flex items-center justify-center text-[var(--pt-text-tertiary)] hover:bg-gray-100 hover:text-[var(--pt-text-secondary)] transition-colors"
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-20 bg-white border border-[var(--pt-border)] rounded-lg shadow-lg py-1 min-w-[152px]">
          <button
            onClick={() => { onBatches(); setOpen(false) }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--pt-text)] hover:bg-gray-50 transition-colors"
          >
            <Layers size={14} />
            View Batches
          </button>
          <button
            onClick={() => { onEdit(); setOpen(false) }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--pt-text)] hover:bg-gray-50 transition-colors"
          >
            <Pencil size={14} />
            Edit Product
          </button>
        </div>
      )}
    </div>
  )
}

export function InventoryTable({ products, branchId, isLoading }: Props) {
  const [batchesProduct, setBatchesProduct] = useState<ProductStock | null>(null)
  const [editProductId, setEditProductId] = useState<string | null>(null)

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-[var(--pt-border)] overflow-hidden">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex gap-4 px-5 py-4 border-b border-[var(--pt-border)] last:border-b-0 animate-pulse">
            <div className="w-8 h-8 rounded-md bg-gray-100 shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3 bg-gray-100 rounded w-40" />
              <div className="h-2.5 bg-gray-100 rounded w-24" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (products.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-[var(--pt-border)] flex flex-col items-center justify-center py-20 text-[var(--pt-text-tertiary)]">
        <Pill size={36} strokeWidth={1.5} className="mb-3" />
        <p className="text-sm">No products match your filters</p>
      </div>
    )
  }

  return (
    <>
      <div className="bg-white rounded-xl border border-[var(--pt-border)] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--pt-border)] bg-gray-50">
              <th className="px-5 py-3 text-left text-[11px] font-bold text-[var(--pt-text-secondary)] uppercase tracking-wider">
                Product
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-bold text-[var(--pt-text-secondary)] uppercase tracking-wider hidden md:table-cell">
                Strength
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-bold text-[var(--pt-text-secondary)] uppercase tracking-wider hidden lg:table-cell">
                Form
              </th>
              <th className="px-4 py-3 text-right text-[11px] font-bold text-[var(--pt-text-secondary)] uppercase tracking-wider">
                Stock
              </th>
              <th className="px-4 py-3 text-center text-[11px] font-bold text-[var(--pt-text-secondary)] uppercase tracking-wider hidden md:table-cell">
                Batches
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-bold text-[var(--pt-text-secondary)] uppercase tracking-wider hidden lg:table-cell">
                Earliest Expiry
              </th>
              <th className="px-4 py-3 text-right text-[11px] font-bold text-[var(--pt-text-secondary)] uppercase tracking-wider hidden sm:table-cell">
                Price
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-bold text-[var(--pt-text-secondary)] uppercase tracking-wider">
                Status
              </th>
              <th className="px-4 py-3 w-10" />
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr
                key={p.product_id}
                className="border-b border-[var(--pt-border)] last:border-b-0 hover:bg-gray-50/60 transition-colors"
              >
                {/* Product */}
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-md bg-gray-100 flex items-center justify-center text-[var(--pt-text-tertiary)] shrink-0">
                      <Pill size={14} />
                    </div>
                    <div>
                      <p className="font-semibold text-[13px]">{p.name}</p>
                      {p.gtin && (
                        <p className="text-[11px] font-mono text-[var(--pt-text-tertiary)] mt-0.5">
                          {p.gtin}
                        </p>
                      )}
                    </div>
                  </div>
                </td>

                {/* Strength */}
                <td className="px-4 py-3.5 text-[var(--pt-text-secondary)] hidden md:table-cell">
                  {p.strength ?? "—"}
                </td>

                {/* Form */}
                <td className="px-4 py-3.5 text-[var(--pt-text-secondary)] hidden lg:table-cell">
                  {p.dosage_form ?? "—"}
                </td>

                {/* Stock */}
                <td className="px-4 py-3.5 text-right">
                  <span
                    className={`font-bold tabular-nums ${stockColor(p.stock_on_hand ?? 0, p.reorder_level ?? 10)}`}
                  >
                    {p.stock_on_hand ?? 0}
                  </span>
                  <span className="text-[11px] text-[var(--pt-text-tertiary)] ml-1">
                    {p.base_unit}
                  </span>
                </td>

                {/* Batches */}
                <td className="px-4 py-3.5 text-center hidden md:table-cell">
                  <button
                    onClick={() => setBatchesProduct(p)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-gray-100 text-[var(--pt-text-secondary)] text-xs font-semibold hover:bg-gray-200 transition-colors"
                    title="View batches"
                  >
                    <Layers size={11} />
                    {p.batch_count ?? 0}
                  </button>
                </td>

                {/* Expiry */}
                <td className="px-4 py-3.5 hidden lg:table-cell">
                  <ExpiryCell expiry={p.earliest_expiry} days={(p as InventoryRow).expiry_days} />
                </td>

                {/* Price */}
                <td className="px-4 py-3.5 text-right tabular-nums text-[var(--pt-text-secondary)] hidden sm:table-cell">
                  {p.selling_price != null ? formatKES(p.selling_price) : "—"}
                </td>

                {/* Status badges */}
                <td className="px-4 py-3.5">
                  <div className="flex flex-wrap gap-1">
                    {(p as InventoryRow).status_badges.map((s) => {
                      const cfg = BADGE_MAP[s]
                      if (!cfg) return null
                      return (
                        <span
                          key={s}
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${cfg.className}`}
                        >
                          {cfg.label}
                        </span>
                      )
                    })}
                  </div>
                </td>

                {/* Actions */}
                <td className="px-4 py-3.5">
                  <ActionMenu
                    product={p}
                    onBatches={() => setBatchesProduct(p)}
                    onEdit={() => setEditProductId(p.product_id ?? null)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <BatchesSheet
        product={batchesProduct}
        branchId={branchId}
        open={batchesProduct !== null}
        onClose={() => setBatchesProduct(null)}
      />

      <EditProductSheet
        productId={editProductId}
        onClose={() => setEditProductId(null)}
      />
    </>
  )
}
