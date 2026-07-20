"use client"

import { useState, useCallback } from "react"
import { useQuery } from "@tanstack/react-query"
import { Receipt, ChevronLeft, ChevronRight, Search } from "lucide-react"
import { SaleDetailSheet } from "@/components/sales/SaleDetailSheet"
import { useUIStore } from "@/lib/store/uiStore"
import { useDebounce } from "@/lib/hooks/useDebounce"
import { formatKES } from "@/lib/store/cartStore"

interface SaleRow {
  id: string
  receipt_number: string
  created_at: string
  payment_method: string
  total_amount: number
  cashier_name: string
  item_count: number
}

interface SalesResponse {
  sales: SaleRow[]
  total: number
  page: number
  limit: number
}

const PAGE_SIZE = 20

function useSales(branchId: string | null, from: string, to: string, q: string, page: number) {
  return useQuery<SalesResponse>({
    queryKey: ["sales", branchId, from, to, q, page],
    queryFn: async () => {
      const params = new URLSearchParams({
        branch_id: branchId!,
        page: String(page),
        limit: String(PAGE_SIZE),
      })
      if (from) params.set("from", from)
      if (to) params.set("to", to + "T23:59:59")
      if (q) params.set("q", q)
      const res = await fetch(`/api/sales?${params}`)
      if (!res.ok) throw new Error("Failed to load sales")
      return res.json() as Promise<SalesResponse>
    },
    enabled: !!branchId,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })
}

function fmt(dateStr: string) {
  return new Date(dateStr).toLocaleString("en-KE", {
    day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit",
    timeZone: "Africa/Nairobi",
  })
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function weekStart() {
  const d = new Date()
  d.setDate(d.getDate() - d.getDay())
  return d.toISOString().slice(0, 10)
}

export default function SalesPage() {
  const branchId = useUIStore((s) => s.activeBranchId)
  const [from, setFrom] = useState(weekStart())
  const [to, setTo] = useState(today())
  const [rawSearch, setRawSearch] = useState("")
  const q = useDebounce(rawSearch, 300)
  const [page, setPage] = useState(1)
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null)

  const { data, isLoading, isFetching } = useSales(branchId, from, to, q, page)

  const handleFilterChange = useCallback(() => setPage(1), [])

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sales</h1>
          <p className="text-sm text-[var(--pt-text-secondary)] mt-0.5">
            {data?.total ?? "—"} sales in selected period
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--pt-text-tertiary)]" />
            <input
              type="text"
              placeholder="Receipt #"
              value={rawSearch}
              onChange={(e) => { setRawSearch(e.target.value); handleFilterChange() }}
              className="h-9 w-32 rounded-lg border border-[var(--pt-border)] pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pt-green)]"
            />
          </div>
          <input
            type="date"
            value={from}
            onChange={(e) => { setFrom(e.target.value); handleFilterChange() }}
            className="h-9 rounded-lg border border-[var(--pt-border)] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pt-green)]"
          />
          <span className="text-[var(--pt-text-tertiary)] text-sm">to</span>
          <input
            type="date"
            value={to}
            onChange={(e) => { setTo(e.target.value); handleFilterChange() }}
            className="h-9 rounded-lg border border-[var(--pt-border)] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pt-green)]"
          />
        </div>
      </div>

      <div className={`${isFetching && !isLoading ? "opacity-70 transition-opacity" : ""}`}>
        {isLoading ? (
          <div className="bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] overflow-hidden">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex gap-4 px-5 py-4 border-b border-[var(--pt-border)] last:border-b-0 animate-pulse">
                <div className="w-8 h-8 rounded-lg bg-[var(--pt-muted-strong)] shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-[var(--pt-muted-strong)] rounded w-40" />
                  <div className="h-2.5 bg-[var(--pt-muted-strong)] rounded w-28" />
                </div>
                <div className="h-3 bg-[var(--pt-muted-strong)] rounded w-20" />
              </div>
            ))}
          </div>
        ) : !data?.sales.length ? (
          <div className="bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] flex flex-col items-center justify-center py-20 text-[var(--pt-text-tertiary)]">
            <Receipt size={36} strokeWidth={1.5} className="mb-3" />
            <p className="text-sm">No sales in this period</p>
          </div>
        ) : (
          <div className="bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--pt-border)] bg-[var(--pt-muted)]">
                  <th className="px-5 py-3 text-left text-[11px] font-bold text-[var(--pt-text-secondary)] uppercase tracking-wider">Receipt</th>
                  <th className="px-4 py-3 text-left text-[11px] font-bold text-[var(--pt-text-secondary)] uppercase tracking-wider hidden sm:table-cell">Date</th>
                  <th className="px-4 py-3 text-left text-[11px] font-bold text-[var(--pt-text-secondary)] uppercase tracking-wider hidden md:table-cell">Cashier</th>
                  <th className="px-4 py-3 text-left text-[11px] font-bold text-[var(--pt-text-secondary)] uppercase tracking-wider hidden lg:table-cell">Payment</th>
                  <th className="px-4 py-3 text-right text-[11px] font-bold text-[var(--pt-text-secondary)] uppercase tracking-wider hidden sm:table-cell">Items</th>
                  <th className="px-4 py-3 text-right text-[11px] font-bold text-[var(--pt-text-secondary)] uppercase tracking-wider">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.sales.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => setSelectedSaleId(s.id)}
                    className="border-b border-[var(--pt-border)] last:border-b-0 hover:bg-[var(--pt-muted)]/60 cursor-pointer transition-colors"
                  >
                    <td className="px-5 py-3.5">
                      <p className="font-semibold text-[13px] tabular-nums">{s.receipt_number}</p>
                    </td>
                    <td className="px-4 py-3.5 text-[var(--pt-text-secondary)] hidden sm:table-cell">{fmt(s.created_at)}</td>
                    <td className="px-4 py-3.5 text-[var(--pt-text-secondary)] hidden md:table-cell">{s.cashier_name}</td>
                    <td className="px-4 py-3.5 hidden lg:table-cell">
                      <span className="capitalize text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[var(--pt-muted)] text-[var(--pt-text-secondary)]">
                        {s.payment_method}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums hidden sm:table-cell">{s.item_count}</td>
                    <td className="px-4 py-3.5 text-right font-semibold tabular-nums">{formatKES(s.total_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {data && data.total > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-[var(--pt-text-secondary)]">
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, data.total)} of {data.total}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="w-8 h-8 rounded-md border border-[var(--pt-border)] flex items-center justify-center text-[var(--pt-text-secondary)] hover:bg-[var(--pt-muted)] disabled:opacity-40"
            >
              <ChevronLeft size={15} />
            </button>
            <span className="flex items-center px-3 text-sm font-medium">{page} / {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="w-8 h-8 rounded-md border border-[var(--pt-border)] flex items-center justify-center text-[var(--pt-text-secondary)] hover:bg-[var(--pt-muted)] disabled:opacity-40"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}

      <SaleDetailSheet
        saleId={selectedSaleId}
        onClose={() => setSelectedSaleId(null)}
      />
    </div>
  )
}
