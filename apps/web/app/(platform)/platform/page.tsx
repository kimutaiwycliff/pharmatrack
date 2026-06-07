"use client"

import { useState } from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { Plus, Building2 } from "lucide-react"
import { ProvisionDialog } from "@/components/platform/ProvisionDialog"
import type { TenantSummary, SubscriptionStatus } from "@pharmatrack/types"

const STATUS_STYLES: Record<string, string> = {
  trialing: "bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-500/30",
  active: "bg-[var(--pt-green-50)] text-[var(--pt-green-600)] border-[var(--pt-green-100)]",
  past_due: "bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30",
  suspended: "bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 border-red-200 dark:border-red-500/30",
  cancelled: "bg-[var(--pt-muted-strong)] text-[var(--pt-text-secondary)] border-[var(--pt-border)]",
}

function StatusBadge({ status }: { status: SubscriptionStatus | null }) {
  const s = status ?? "cancelled"
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${STATUS_STYLES[s]}`}>{s.replace("_", " ")}</span>
}

function fmtDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" }) : "—"
}

export default function PlatformTenantsPage() {
  const [provision, setProvision] = useState(false)
  const { data: tenants = [], isLoading } = useQuery<TenantSummary[]>({
    queryKey: ["tenants"],
    queryFn: async () => {
      const res = await fetch("/api/platform/tenants")
      if (!res.ok) throw new Error("Failed to load tenants")
      const json = (await res.json()) as { tenants: TenantSummary[] }
      return json.tenants
    },
  })

  const total = tenants.length
  const active = tenants.filter((t) => t.subscription?.status === "active").length
  const trialing = tenants.filter((t) => t.subscription?.status === "trialing").length

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tenants</h1>
          <p className="text-sm text-[var(--pt-text-secondary)] mt-0.5">Pharmacies on PharmaTrack</p>
        </div>
        <button onClick={() => setProvision(true)} className="inline-flex items-center gap-2 px-4 h-9 rounded-lg bg-[var(--pt-green)] text-white text-sm font-semibold hover:bg-[var(--pt-green-600)] transition-colors shrink-0">
          <Plus size={16} /> Add pharmacy
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-5 max-w-xl">
        {[["Total", total], ["Active", active], ["Trialing", trialing]].map(([label, val]) => (
          <div key={label} className="bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] px-4 py-3">
            <p className="text-[11px] font-semibold text-[var(--pt-text-secondary)] uppercase tracking-wide">{label}</p>
            <p className="text-xl font-bold tabular-nums mt-0.5">{val}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] overflow-hidden">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="px-5 py-4 border-b border-[var(--pt-border)] last:border-b-0 animate-pulse">
              <div className="h-3.5 bg-[var(--pt-muted-strong)] rounded w-48 mb-2" />
              <div className="h-2.5 bg-[var(--pt-muted-strong)] rounded w-64" />
            </div>
          ))
        ) : tenants.length === 0 ? (
          <div className="px-5 py-12 flex flex-col items-center text-center text-sm text-[var(--pt-text-tertiary)]">
            <Building2 size={32} strokeWidth={1.5} className="mb-3" /> No pharmacies yet
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--pt-border)] bg-[var(--pt-muted)]">
                <th className="px-5 py-3 text-left text-[11px] font-bold text-[var(--pt-text-secondary)] uppercase tracking-wider">Pharmacy</th>
                <th className="px-4 py-3 text-left text-[11px] font-bold text-[var(--pt-text-secondary)] uppercase tracking-wider hidden sm:table-cell">Plan</th>
                <th className="px-4 py-3 text-center text-[11px] font-bold text-[var(--pt-text-secondary)] uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-[11px] font-bold text-[var(--pt-text-secondary)] uppercase tracking-wider hidden md:table-cell">Paid until</th>
                <th className="px-4 py-3 text-center text-[11px] font-bold text-[var(--pt-text-secondary)] uppercase tracking-wider hidden lg:table-cell">Branches</th>
                <th className="px-4 py-3 text-center text-[11px] font-bold text-[var(--pt-text-secondary)] uppercase tracking-wider hidden lg:table-cell">Staff</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t.id} className="border-b border-[var(--pt-border)] last:border-b-0 hover:bg-[var(--pt-muted)]/60 transition-colors">
                  <td className="px-5 py-3.5">
                    <Link href={`/platform/${t.id}`} className="font-semibold hover:text-[var(--pt-green-600)]">{t.name}</Link>
                    <p className="text-[11px] text-[var(--pt-text-tertiary)]">{t.email ?? "—"}</p>
                  </td>
                  <td className="px-4 py-3.5 text-[var(--pt-text-secondary)] hidden sm:table-cell">{t.plan_name ?? "—"}</td>
                  <td className="px-4 py-3.5 text-center"><StatusBadge status={t.subscription?.status ?? null} /></td>
                  <td className="px-4 py-3.5 text-[var(--pt-text-secondary)] hidden md:table-cell">{fmtDate(t.subscription?.current_period_end ?? null)}</td>
                  <td className="px-4 py-3.5 text-center tabular-nums hidden lg:table-cell">{t.branch_count}</td>
                  <td className="px-4 py-3.5 text-center tabular-nums hidden lg:table-cell">{t.staff_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {provision && <ProvisionDialog open={provision} onOpenChange={setProvision} />}
    </div>
  )
}
