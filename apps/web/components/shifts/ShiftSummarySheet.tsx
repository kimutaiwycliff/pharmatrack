"use client"

import { Sheet, SheetContent } from "@/components/ui/sheet"
import { useQuery } from "@tanstack/react-query"
import { Clock, X, TrendingUp, Banknote, Smartphone, AlertTriangle } from "lucide-react"
import { formatKES } from "@/lib/store/cartStore"

interface ShiftRow {
  id: string
  clocked_in_at: string
  clocked_out_at: string | null
  opening_float: number
  closing_cash: number | null
  notes: string | null
  sale_count: number
  total_sales: number
  cash_sales: number
  mpesa_sales: number
  variance: number | null
  profiles: { full_name: string; role: string }
}

interface Props {
  shiftId: string | null
  onClose: () => void
}

function StatCard({ icon: Icon, label, value, color }: {
  icon: React.ElementType
  label: string
  value: string
  color?: string
}) {
  return (
    <div className="bg-[var(--pt-muted)] rounded-xl px-4 py-3">
      <div className="flex items-center gap-2 mb-1">
        <Icon size={13} className={color ?? "text-[var(--pt-text-secondary)]"} />
        <p className="text-[11px] font-semibold text-[var(--pt-text-secondary)] uppercase tracking-wide">{label}</p>
      </div>
      <p className="text-base font-bold tabular-nums">{value}</p>
    </div>
  )
}

function fmt(dateStr: string) {
  return new Date(dateStr).toLocaleString("en-KE", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
    timeZone: "Africa/Nairobi",
  })
}

function duration(from: string, to: string | null) {
  const ms = (to ? new Date(to).getTime() : Date.now()) - new Date(from).getTime()
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return `${h}h ${m}m${to ? "" : " (ongoing)"}`
}

function useShiftDetail(id: string | null) {
  return useQuery<{ shift: ShiftRow }>({
    queryKey: ["shift-detail", id],
    queryFn: async () => {
      const res = await fetch(`/api/shifts/${id}`)
      if (!res.ok) throw new Error("Failed to load shift")
      return res.json() as Promise<{ shift: ShiftRow }>
    },
    enabled: !!id,
    staleTime: 30_000,
  })
}

export function ShiftSummarySheet({ shiftId, onClose }: Props) {
  const { data, isLoading } = useShiftDetail(shiftId)
  const shift = data?.shift

  return (
    <Sheet open={!!shiftId} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-full sm:max-w-[480px] p-0 flex flex-col gap-0"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--pt-border)] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[var(--pt-muted-strong)] flex items-center justify-center text-[var(--pt-text-secondary)]">
              <Clock size={17} />
            </div>
            <div>
              <h2 className="text-base font-bold">Shift Report</h2>
              {shift && (
                <p className="text-xs text-[var(--pt-text-secondary)]">
                  {shift.profiles.full_name} · {shift.profiles.role}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--pt-muted-strong)] text-[var(--pt-text-secondary)]"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {isLoading && (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-16 bg-[var(--pt-muted-strong)] rounded-xl animate-pulse" />
              ))}
            </div>
          )}

          {shift && (
            <>
              {/* Timing */}
              <div className="space-y-2">
                <p className="text-[11px] font-bold text-[var(--pt-text-secondary)] uppercase tracking-wide">Timing</p>
                <div className="bg-[var(--pt-muted)] rounded-xl px-4 py-3 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--pt-text-secondary)]">Opened</span>
                    <span className="font-semibold">{fmt(shift.clocked_in_at)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--pt-text-secondary)]">Closed</span>
                    <span className="font-semibold">
                      {shift.clocked_out_at ? fmt(shift.clocked_out_at) : <span className="text-[var(--pt-green)]">Active</span>}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--pt-text-secondary)]">Duration</span>
                    <span className="font-semibold">{duration(shift.clocked_in_at, shift.clocked_out_at)}</span>
                  </div>
                </div>
              </div>

              {/* Sales */}
              <div className="space-y-2">
                <p className="text-[11px] font-bold text-[var(--pt-text-secondary)] uppercase tracking-wide">Sales</p>
                <div className="grid grid-cols-2 gap-2">
                  <StatCard icon={TrendingUp} label="Total Sales" value={formatKES(shift.total_sales)} />
                  <StatCard icon={TrendingUp} label="Transactions" value={String(shift.sale_count)} />
                  <StatCard icon={Banknote} label="Cash Sales" value={formatKES(shift.cash_sales)} />
                  <StatCard icon={Smartphone} label="M-Pesa Sales" value={formatKES(shift.mpesa_sales)} />
                </div>
              </div>

              {/* Float & Variance */}
              <div className="space-y-2">
                <p className="text-[11px] font-bold text-[var(--pt-text-secondary)] uppercase tracking-wide">Cash Reconciliation</p>
                <div className="bg-[var(--pt-muted)] rounded-xl px-4 py-3 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--pt-text-secondary)]">Opening Float</span>
                    <span className="font-semibold tabular-nums">{formatKES(shift.opening_float)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--pt-text-secondary)]">Cash Collected</span>
                    <span className="font-semibold tabular-nums">{formatKES(shift.cash_sales)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--pt-text-secondary)]">Expected in Drawer</span>
                    <span className="font-bold tabular-nums">{formatKES(shift.opening_float + shift.cash_sales)}</span>
                  </div>
                  {shift.closing_cash != null && (
                    <>
                      <div className="border-t border-[var(--pt-border)] my-1" />
                      <div className="flex justify-between text-sm">
                        <span className="text-[var(--pt-text-secondary)]">Closing Cash</span>
                        <span className="font-semibold tabular-nums">{formatKES(shift.closing_cash)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="flex items-center gap-1 text-[var(--pt-text-secondary)]">
                          {shift.variance !== null && Math.abs(shift.variance) > 1 && (
                            <AlertTriangle size={12} className="text-[var(--pt-amber)]" />
                          )}
                          Variance
                        </span>
                        <span className={`font-bold tabular-nums ${
                          shift.variance === null ? "" :
                          Math.abs(shift.variance) < 1 ? "text-[var(--pt-green)]" : "text-[var(--pt-amber)]"
                        }`}>
                          {shift.variance != null ? formatKES(shift.variance) : "—"}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Notes */}
              {shift.notes && (
                <div className="space-y-2">
                  <p className="text-[11px] font-bold text-[var(--pt-text-secondary)] uppercase tracking-wide">Notes</p>
                  <p className="text-sm bg-[var(--pt-muted)] rounded-xl px-4 py-3 text-[var(--pt-text)]">{shift.notes}</p>
                </div>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
