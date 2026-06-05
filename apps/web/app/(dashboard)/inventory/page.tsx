"use client"

import { useState, useCallback } from "react"
import { useQuery } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { Search, PackagePlus, ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { InventoryTable } from "@/components/inventory/InventoryTable"
import { useUIStore } from "@/lib/store/uiStore"
import { useDebounce } from "@/lib/hooks/useDebounce"

type StatusFilter = "all" | "out_of_stock" | "low_stock" | "expiring" | "controlled"

interface InventoryResponse {
  products: InventoryRow[]
  total: number
  page: number
  limit: number
  summary: {
    outOfStock: number
    lowStock: number
    expiring: number
    controlled: number
  }
}

interface InventoryRow {
  product_id: string
  name: string
  strength: string | null
  dosage_form: string | null
  gtin: string | null
  stock_on_hand: number
  earliest_expiry: string | null
  batch_count: number
  reorder_level: number | null
  is_controlled: boolean
  selling_price: number | null
  base_unit: string
  status_badges: string[]
  expiry_days: number | null
}

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "out_of_stock", label: "Out of stock" },
  { key: "low_stock", label: "Low stock" },
  { key: "expiring", label: "Expiring" },
  { key: "controlled", label: "Controlled" },
]

const PAGE_SIZE = 20

function useInventory(branchId: string | null, q: string, status: StatusFilter, page: number) {
  return useQuery<InventoryResponse>({
    queryKey: ["inventory", branchId, q, status, page],
    queryFn: async () => {
      const params = new URLSearchParams({
        branch_id: branchId!,
        q,
        status,
        page: String(page),
        limit: String(PAGE_SIZE),
      })
      const res = await fetch(`/api/inventory?${params}`)
      if (!res.ok) throw new Error("Failed to load inventory")
      return res.json() as Promise<InventoryResponse>
    },
    enabled: !!branchId,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })
}

export default function InventoryPage() {
  const router = useRouter()
  const branchId = useUIStore((s) => s.activeBranchId)

  const [rawSearch, setRawSearch] = useState("")
  const [status, setStatus] = useState<StatusFilter>("all")
  const [page, setPage] = useState(1)

  const q = useDebounce(rawSearch, 300)

  const { data, isLoading, isFetching } = useInventory(branchId, q, status, page)

  const handleStatusChange = useCallback((s: StatusFilter) => {
    setStatus(s)
    setPage(1)
  }, [])

  const handleSearch = useCallback((v: string) => {
    setRawSearch(v)
    setPage(1)
  }, [])

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1
  const summary = data?.summary

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inventory</h1>
          <p className="text-sm text-[var(--pt-text-secondary)] mt-0.5">
            {branchId ? `${data?.total ?? "—"} products` : "Select a branch"}
          </p>
        </div>
        <Button
          onClick={() => router.push("/inventory/receive")}
          className="gap-2"
        >
          <PackagePlus size={16} />
          Receive Stock
        </Button>
      </div>

      {/* Summary chips */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          {[
            { label: "Out of stock", value: summary.outOfStock, color: "text-[var(--pt-red)]" },
            { label: "Low stock",    value: summary.lowStock,    color: "text-[var(--pt-amber)]" },
            { label: "Expiring",     value: summary.expiring,    color: "text-yellow-600" },
            { label: "Controlled",   value: summary.controlled,  color: "text-blue-600" },
          ].map(({ label, value, color }) => (
            <div
              key={label}
              className="bg-white rounded-xl border border-[var(--pt-border)] px-4 py-3"
            >
              <p className="text-[11px] font-semibold text-[var(--pt-text-secondary)] uppercase tracking-wide">
                {label}
              </p>
              <p className={`text-xl font-bold tabular-nums mt-0.5 ${color}`}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--pt-text-tertiary)] pointer-events-none"
          />
          <Input
            placeholder="Search by name, barcode, strength…"
            value={rawSearch}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        <div className="flex gap-1.5 flex-wrap">
          {STATUS_FILTERS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => handleStatusChange(key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                status === key
                  ? "bg-[var(--pt-green)] text-white border-[var(--pt-green)]"
                  : "bg-white text-[var(--pt-text-secondary)] border-[var(--pt-border)] hover:bg-gray-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className={isFetching && !isLoading ? "opacity-70 transition-opacity" : ""}>
        <InventoryTable
          products={(data?.products ?? []) as Parameters<typeof InventoryTable>[0]["products"]}
          branchId={branchId ?? ""}
          isLoading={isLoading}
        />
      </div>

      {/* Pagination */}
      {data && data.total > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-[var(--pt-text-secondary)]">
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, data.total)} of{" "}
            {data.total}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="w-8 h-8 rounded-md border border-[var(--pt-border)] flex items-center justify-center text-[var(--pt-text-secondary)] hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={15} />
            </button>
            <span className="flex items-center px-3 text-sm font-medium">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="w-8 h-8 rounded-md border border-[var(--pt-border)] flex items-center justify-center text-[var(--pt-text-secondary)] hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
