"use client"

import { useState, useCallback } from "react"
import { useQuery } from "@tanstack/react-query"
import { Clock, ChevronLeft, ChevronRight } from "lucide-react"
import { ShiftSummarySheet } from "@/components/shifts/ShiftSummarySheet"
import { useUIStore } from "@/lib/store/uiStore"
import { formatKES } from "@/lib/store/cartStore"
import { varianceSeverity } from "@/lib/shifts/variance"

interface ShiftRow {
  id: string
  clocked_in_at: string
  clocked_out_at: string | null
  opening_float: number
  closing_cash: number | null
  sale_count: number
  total_sales: number
  cash_sales: number
  mpesa_sales: number
  variance: number | null
  profiles: { full_name: string; role: string }
}

interface ShiftsResponse {
  shifts: ShiftRow[]
  total: number
  page: number
  limit: number
}

const PAGE_SIZE = 20

function useShifts(branchId: string | null, from: string, to: string, page: number) {
  return useQuery<ShiftsResponse>({
    queryKey: ["shifts", branchId, from, to, page],
    queryFn: async () => {
      const params = new URLSearchParams({
        branch_id: branchId!,
        page: String(page),
        limit: String(PAGE_SIZE),
      })
      if (from) params.set("from", from)
      if (to) params.set("to", to + "T23:59:59")
      const res = await fetch(`/api/shifts?${params}`)
      if (!res.ok) throw new Error("Failed to load shifts")
      return res.json() as Promise<ShiftsResponse>
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

function duration(from: string, to: string | null) {
  const ms = (to ? new Date(to).getTime() : Date.now()) - new Date(from).getTime()
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return `${h}h ${m}m`
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function weekStart() {
  const d = new Date()
  d.setDate(d.getDate() - d.getDay())
  return d.toISOString().slice(0, 10)
}

export default function ShiftsPage() {
  const branchId = useUIStore((s) => s.activeBranchId)
  const [from, setFrom] = useState(weekStart())
  const [to, setTo] = useState(today())
  const [page, setPage] = useState(1)
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null)

  const { data, isLoading, isFetching } = useShifts(branchId, from, to, page)

  const handleDateChange = useCallback(() => setPage(1), [])

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Shifts</h1>
          <p className="text-sm text-[var(--pt-text-secondary)] mt-0.5">
            {data?.total ?? "—"} shifts in selected period
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={from}
            onChange={(e) => { setFrom(e.target.value); handleDateChange() }}
            className="h-9 rounded-lg border border-[var(--pt-border)] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pt-green)]"
          />
          <span className="text-[var(--pt-text-tertiary)] text-sm">to</span>
          <input
            type="date"
            value={to}
            onChange={(e) => { setTo(e.target.value); handleDateChange() }}
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
        ) : !data?.shifts.length ? (
          <div className="bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] flex flex-col items-center justify-center py-20 text-[var(--pt-text-tertiary)]">
            <Clock size={36} strokeWidth={1.5} className="mb-3" />
            <p className="text-sm">No shifts in this period</p>
          </div>
        ) : (
          <div className="bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--pt-border)] bg-[var(--pt-muted)]">
                  <th className="px-5 py-3 text-left text-[11px] font-bold text-[var(--pt-text-secondary)] uppercase tracking-wider">Staff</th>
                  <th className="px-4 py-3 text-left text-[11px] font-bold text-[var(--pt-text-secondary)] uppercase tracking-wider hidden sm:table-cell">Opened</th>
                  <th className="px-4 py-3 text-left text-[11px] font-bold text-[var(--pt-text-secondary)] uppercase tracking-wider hidden md:table-cell">Closed</th>
                  <th className="px-4 py-3 text-left text-[11px] font-bold text-[var(--pt-text-secondary)] uppercase tracking-wider hidden lg:table-cell">Duration</th>
                  <th className="px-4 py-3 text-right text-[11px] font-bold text-[var(--pt-text-secondary)] uppercase tracking-wider">Sales</th>
                  <th className="px-4 py-3 text-right text-[11px] font-bold text-[var(--pt-text-secondary)] uppercase tracking-wider hidden sm:table-cell">Total</th>
                  <th className="px-4 py-3 text-right text-[11px] font-bold text-[var(--pt-text-secondary)] uppercase tracking-wider hidden lg:table-cell">Variance</th>
                </tr>
              </thead>
              <tbody>
                {data.shifts.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => setSelectedShiftId(s.id)}
                    className="border-b border-[var(--pt-border)] last:border-b-0 hover:bg-[var(--pt-muted)]/60 cursor-pointer transition-colors"
                  >
                    <td className="px-5 py-3.5">
                      <p className="font-semibold text-[13px]">{s.profiles.full_name}</p>
                      <p className="text-[11px] text-[var(--pt-text-tertiary)] capitalize">{s.profiles.role}</p>
                    </td>
                    <td className="px-4 py-3.5 text-[var(--pt-text-secondary)] hidden sm:table-cell">{fmt(s.clocked_in_at)}</td>
                    <td className="px-4 py-3.5 hidden md:table-cell">
                      {s.clocked_out_at ? (
                        <span className="text-[var(--pt-text-secondary)]">{fmt(s.clocked_out_at)}</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--pt-green)]">
                          <span className="w-1.5 h-1.5 rounded-full bg-[var(--pt-green)] animate-pulse" />
                          Active
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-[var(--pt-text-secondary)] hidden lg:table-cell">
                      {duration(s.clocked_in_at, s.clocked_out_at)}
                    </td>
                    <td className="px-4 py-3.5 text-right font-semibold tabular-nums">{s.sale_count}</td>
                    <td className="px-4 py-3.5 text-right tabular-nums font-semibold hidden sm:table-cell">
                      {formatKES(s.total_sales)}
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums hidden lg:table-cell">
                      {s.variance != null ? (
                        <span className={
                          varianceSeverity(s.variance) === "ok" ? "text-[var(--pt-green)] font-semibold" :
                          varianceSeverity(s.variance) === "serious" ? "text-[var(--pt-red)] font-semibold" :
                          "text-[var(--pt-amber)] font-semibold"
                        }>
                          {s.variance >= 0 ? "+" : ""}{formatKES(s.variance)}
                        </span>
                      ) : (
                        <span className="text-[var(--pt-text-tertiary)]">—</span>
                      )}
                    </td>
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

      <ShiftSummarySheet
        shiftId={selectedShiftId}
        onClose={() => setSelectedShiftId(null)}
      />
    </div>
  )
}
