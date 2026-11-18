"use client"

import { Download } from "lucide-react"
import { formatKES } from "@/lib/store/cartStore"

// Sales report, cashier-station pharmacies only (ADR-021): order desks'
// takings, and the sales that skipped the cashier in a branch that pays at one.

export interface StationReportData {
  throughCashier: number
  bySoldBy: Array<{ name: string; revenue: number; count: number }>
  directCount: number
  directTotal: number
  direct: Array<{ id: string; receipt_number: string | null; created_at: string; seller: string; branch: string; total_amount: number; how: "offline" | "allowed" | "direct" }>
}

const HOW: Record<StationReportData["direct"][number]["how"], [string, string]> = {
  direct: ["Skipped the cashier", "bg-[var(--pt-red-50)] text-[var(--pt-red)]"],
  offline: ["Sold while offline", "bg-amber-50 text-amber-900"],
  allowed: ["Branch allows it", "bg-[var(--pt-muted)] text-[var(--pt-text-secondary)]"],
}

export function StationReport({ data, onExport }: { data: StationReportData; onExport: (rows: Record<string, unknown>[], name: string) => void }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] p-5">
        <h3 className="text-[14px] font-bold">Sales by order desk</h3>
        <p className="text-[12px] text-[var(--pt-text-tertiary)] mb-4">Paid at the cashier · {formatKES(data.throughCashier)}</p>
        <div className="space-y-2">
          {data.bySoldBy.map((d) => (
            <div key={d.name} className="flex items-center justify-between py-2 border-b border-[var(--pt-border)] last:border-b-0 text-[13px]">
              <span className="font-medium">{d.name}</span>
              <span className="text-right">
                <span className="block font-semibold tabular-nums">{formatKES(d.revenue)}</span>
                <span className="block text-[11px] text-[var(--pt-text-tertiary)]">{d.count} orders</span>
              </span>
            </div>
          ))}
          {data.bySoldBy.length === 0 && <p className="text-[13px] text-[var(--pt-text-tertiary)]">No orders paid at the cashier in range</p>}
        </div>
      </div>

      <div className="bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[14px] font-bold">Sales without the cashier</h3>
            <p className="text-[12px] text-[var(--pt-text-tertiary)] mb-4">
              {data.directCount === 0 ? "None — every sale went through the cashier." : `${data.directCount} sale${data.directCount === 1 ? "" : "s"} · ${formatKES(data.directTotal)}`}
            </p>
          </div>
          {data.direct.length > 0 && (
            <button
              onClick={() => onExport(data.direct.map((d) => ({ ...d, how: HOW[d.how][0] })), "sales-without-cashier.csv")}
              className="flex items-center gap-1.5 text-[12px] text-[var(--pt-text-secondary)] hover:text-[var(--pt-text)]"
            >
              <Download size={13} /> CSV
            </button>
          )}
        </div>
        <div className="space-y-1.5 max-h-80 overflow-y-auto">
          {data.direct.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-3 py-1.5 border-b border-[var(--pt-border)] last:border-b-0 text-[12px]">
              <span className="min-w-0">
                <span className="block font-medium truncate">{d.seller} · {d.branch}</span>
                <span className="block text-[var(--pt-text-tertiary)]">
                  {d.receipt_number ?? "—"} · {new Date(d.created_at).toLocaleString("en-KE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" })}
                </span>
              </span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${HOW[d.how][1]}`}>{HOW[d.how][0]}</span>
              <span className="shrink-0 font-semibold tabular-nums">{formatKES(d.total_amount)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
