"use client"

import { useState, useCallback, useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { Search, PackagePlus, ChevronLeft, ChevronRight, Tag, Loader2, ClipboardCheck, ClipboardList } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { InventoryTable } from "@/components/inventory/InventoryTable"
import { CatalogSeedControls } from "@/components/inventory/CatalogSeedControls"
import { LabelPrintDialog } from "@/components/labels/LabelPrintDialog"
import { useCan } from "@/lib/store/sessionStore"
import { useDebounce } from "@/lib/hooks/useDebounce"
import type { LabelItem, LabelSize } from "@/components/labels/LabelPDF"
import type { Organization } from "@pharmatrack/types"
import { useBranchScope } from "@/lib/hooks/useBranchScope"
import { useUrlParams } from "@/lib/hooks/useUrlParams"
import { LoadError } from "@/components/LoadError"

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

function useInventory(branchId: string | null, ready: boolean, q: string, status: StatusFilter, page: number) {
  return useQuery<InventoryResponse>({
    queryKey: ["inventory", branchId, q, status, page],
    queryFn: async () => {
      const params = new URLSearchParams({
        ...(branchId ? { branch_id: branchId } : {}),
        q,
        status,
        page: String(page),
        limit: String(PAGE_SIZE),
      })
      const res = await fetch(`/api/inventory?${params}`)
      if (!res.ok) throw new Error("Failed to load inventory")
      return res.json() as Promise<InventoryResponse>
    },
    enabled: ready,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })
}

export default function InventoryPage() {
  const router = useRouter()
  const { branchId, ready, isAll } = useBranchScope()
  const canManageCatalog = useCan("catalog.seed")
  const canPlanRestock = useCan("purchasing.manage")
  const canReceive = useCan("stock.receive")
  const canCount = useCan("stock.count")

  // Filters live in the URL (?status=low_stock&q=…&page=2): linkable from the
  // bell and dashboard, kept on refresh and Back.
  const [params, setParams] = useUrlParams({ q: "", status: "all", page: "1" })
  const status: StatusFilter = STATUS_FILTERS.some((f) => f.key === params.status) ? (params.status as StatusFilter) : "all"
  const page = Math.max(1, parseInt(params.page, 10) || 1)
  const setPage = (fn: (p: number) => number) => setParams({ page: String(fn(page)) })
  const [rawSearch, setRawSearch] = useState(params.q)
  const [labelItems, setLabelItems] = useState<LabelItem[] | null>(null)
  const [backfilling, setBackfilling] = useState(false)

  const q = useDebounce(rawSearch, 300)
  useEffect(() => {
    if (q !== params.q) setParams({ q, page: "1" })
  }, [q]) // eslint-disable-line react-hooks/exhaustive-deps -- only when the typed search settles

  const { data, isLoading, isFetching, isError, refetch } = useInventory(branchId, ready, params.q, status, page)

  const { data: settingsData } = useQuery<{ org: Organization }>({
    queryKey: ["settings"],
    queryFn: async () => {
      const res = await fetch("/api/settings")
      if (!res.ok) throw new Error("Failed to load settings")
      return res.json() as Promise<{ org: Organization }>
    },
    staleTime: 60_000,
  })
  const labelSize: LabelSize = settingsData?.org.label_size ?? "40x30mm"

  async function backfillAndPrint() {
    setBackfilling(true)
    try {
      const res = await fetch("/api/products/backfill-barcodes", { method: "POST" })
      const json = (await res.json()) as { items?: { code: string; productName: string }[]; error?: string }
      if (!res.ok) throw new Error(json.error ?? "Failed to generate barcodes")
      if (!json.items || json.items.length === 0) {
        toast.info("Every product and pack size already has a barcode")
        return
      }
      setLabelItems(json.items.map((i) => ({ code: i.code, productName: i.productName, price: null, copies: 1 })))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error")
    } finally {
      setBackfilling(false)
    }
  }

  const handleStatusChange = useCallback((s: StatusFilter) => {
    setParams({ status: s, page: "1" })
  }, [setParams])

  const handleSearch = useCallback((v: string) => {
    setRawSearch(v)
  }, [])

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1
  const summary = data?.summary

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inventory</h1>
          <p className="text-sm text-[var(--pt-text-secondary)] mt-0.5">
            {ready ? `${data?.total ?? "—"} products${isAll ? " · all branches" : ""}` : "Loading…"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={backfillAndPrint}
            disabled={backfilling}
            className="gap-2"
          >
            {backfilling ? <Loader2 size={16} className="animate-spin" /> : <Tag size={16} />}
            Print Labels
          </Button>
          {canPlanRestock && (
            <Button variant="outline" onClick={() => router.push("/purchase-orders/new")} className="gap-2">
              <ClipboardCheck size={16} />
              Restock
            </Button>
          )}
          {canCount && (
            <Button variant="outline" onClick={() => router.push("/inventory/stock-take")} className="gap-2">
              <ClipboardList size={16} />
              Stock take
            </Button>
          )}
          {canReceive && (
            <Button
              onClick={() => router.push("/inventory/receive")}
              className="gap-2"
            >
              <PackagePlus size={16} />
              Receive Stock
            </Button>
          )}
        </div>
      </div>

      {/* Summary chips */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          {([
            { key: "out_of_stock", label: "Out of stock", value: summary.outOfStock, color: "text-[var(--pt-red)]" },
            { key: "low_stock",    label: "Low stock",    value: summary.lowStock,    color: "text-[var(--pt-amber)]" },
            { key: "expiring",     label: "Expiring",     value: summary.expiring,    color: "text-yellow-600 dark:text-yellow-400" },
            { key: "controlled",   label: "Controlled",   value: summary.controlled,  color: "text-blue-600 dark:text-blue-400" },
          ] as const).map(({ key, label, value, color }) => (
            // Tapping a card shows just those products (tap again for all).
            <button
              type="button"
              key={label}
              onClick={() => handleStatusChange(status === key ? "all" : key)}
              aria-pressed={status === key}
              className={`text-left bg-[var(--pt-surface)] rounded-xl border px-4 py-3 transition-colors hover:bg-[var(--pt-muted)] ${status === key ? "border-[var(--pt-green)] ring-1 ring-[var(--pt-green)]" : "border-[var(--pt-border)]"}`}
            >
              <p className="text-[11px] font-semibold text-[var(--pt-text-secondary)] uppercase tracking-wide">
                {label}
              </p>
              <p className={`text-xl font-bold tabular-nums mt-0.5 ${color}`}>{value}</p>
            </button>
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
                  : "bg-[var(--pt-surface)] text-[var(--pt-text-secondary)] border-[var(--pt-border)] hover:bg-[var(--pt-muted)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Quick Start: load the Kenyan retail catalogue by department, then price & stock */}
      <CatalogSeedControls canManage={canManageCatalog} branchId={branchId} />

      {/* Table */}
      {isError && !data ? (
        <LoadError what="your stock" onRetry={refetch} />
      ) : (
        <div className={isFetching && !isLoading ? "opacity-70 transition-opacity" : ""}>
          <InventoryTable
            products={(data?.products ?? []) as Parameters<typeof InventoryTable>[0]["products"]}
            branchId={branchId ?? ""}
            isLoading={isLoading}
          />
        </div>
      )}

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
              className="w-8 h-8 rounded-md border border-[var(--pt-border)] flex items-center justify-center text-[var(--pt-text-secondary)] hover:bg-[var(--pt-muted)] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={15} />
            </button>
            <span className="flex items-center px-3 text-sm font-medium">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="w-8 h-8 rounded-md border border-[var(--pt-border)] flex items-center justify-center text-[var(--pt-text-secondary)] hover:bg-[var(--pt-muted)] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}


      <LabelPrintDialog
        open={labelItems !== null}
        onOpenChange={(v) => !v && setLabelItems(null)}
        items={labelItems ?? []}
        labelSize={labelSize}
      />
    </div>
  )
}
