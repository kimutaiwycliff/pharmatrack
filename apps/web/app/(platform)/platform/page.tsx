"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { Plus, Building2, Download, Search, CalendarClock, ChevronRight } from "lucide-react"
import { ProvisionDialog } from "@/components/platform/ProvisionDialog"
import { DailyBars } from "@/components/platform/insights/charts"
import { ago, Card, change, Delta, HealthBadge, Kpi, kesShort, Sparkline } from "@/components/platform/insights/ui"
import type { HealthLevel } from "@/lib/insights/health"
import type { TenantOverview } from "@/lib/insights/overview"
import type { TenantSummary, SubscriptionStatus } from "@pharmatrack/types"

// Operator console home: how the platform is doing and which pharmacies need
// a call. Tenants (subscriptions) come from /api/platform/tenants; usage and
// money from /api/platform/insights.

const STATUS_STYLES: Record<string, string> = {
  trialing: "bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-500/30",
  active: "bg-[var(--pt-green-50)] text-[var(--pt-green-600)] border-[var(--pt-green-100)]",
  past_due: "bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30",
  suspended: "bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 border-red-200 dark:border-red-500/30",
  cancelled: "bg-[var(--pt-muted-strong)] text-[var(--pt-text-secondary)] border-[var(--pt-border)]",
}

function StatusBadge({ status }: { status: SubscriptionStatus | null }) {
  const s = status ?? "cancelled"
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border capitalize ${STATUS_STYLES[s]}`}>{s.replace("_", " ")}</span>
}

function fmtDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString("en-KE", { timeZone: "Africa/Nairobi", day: "numeric", month: "short" }) : "—"
}

interface InsightsResponse {
  platform: {
    mrr: number; collected30: number; tenants: number; revenue30: number; profit30: number; stockCost: number; stockRetail: number
    active7: number; trialsEnding7: number; newSignups30: number; atRisk: number; health: Record<HealthLevel, number>
  }
  daily: Array<{ day: string; revenue: number; activePharmacies: number }>
  tenants: Record<string, TenantOverview>
}

type Filter = "all" | "attention" | "healthy" | "new" | "trials" | "followups"
type Sort = "attention" | "active" | "sales" | "profit" | "stock" | "newest"
const followUpLabel = (ymd: string) => new Date(`${ymd}T12:00:00+03:00`).toLocaleDateString("en-KE", { day: "numeric", month: "short" })
const ATTENTION = new Set<HealthLevel>(["slipping", "at_risk", "never_started", "inactive"])

export default function PlatformTenantsPage() {
  const router = useRouter()
  const [provision, setProvision] = useState(false)
  const [filter, setFilter] = useState<Filter>("all")
  const [sort, setSort] = useState<Sort>("attention")
  const [q, setQ] = useState("")

  const { data: tenants = [], isLoading } = useQuery<TenantSummary[]>({
    queryKey: ["tenants"],
    queryFn: async () => {
      const res = await fetch("/api/platform/tenants")
      if (!res.ok) throw new Error("Failed to load tenants")
      return ((await res.json()) as { tenants: TenantSummary[] }).tenants
    },
  })
  const { data: insights, isLoading: insightsLoading } = useQuery<InsightsResponse>({
    queryKey: ["platform-insights"],
    queryFn: async () => {
      const res = await fetch("/api/platform/insights")
      if (!res.ok) throw new Error("Failed to load insights")
      return res.json() as Promise<InsightsResponse>
    },
    staleTime: 60_000,
  })

  const [now] = useState(() => Date.now())
  const today = useMemo(() => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi" }).format(new Date(now)), [now])
  const rows = useMemo(() => tenants.map((t) => ({ t, i: insights?.tenants[t.id] })), [tenants, insights])
  const isTrialEnding = (r: (typeof rows)[number]) => {
    const end = r.t.subscription?.status === "trialing" ? r.t.subscription.trial_ends_at : null
    return !!end && new Date(end).getTime() - now <= 7 * 86_400_000 && new Date(end).getTime() >= now
  }
  const followUpDue = (r: (typeof rows)[number]) => !!r.i?.followUpOn && r.i.followUpOn <= today

  const counts = {
    all: rows.length,
    attention: rows.filter((r) => r.i && ATTENTION.has(r.i.health.level)).length,
    healthy: rows.filter((r) => r.i?.health.level === "healthy").length,
    new: rows.filter((r) => r.i?.health.level === "new").length,
    trials: rows.filter(isTrialEnding).length,
    followups: rows.filter(followUpDue).length,
  }

  const shown = rows
    .filter((r) => {
      if (filter === "attention") return !!r.i && ATTENTION.has(r.i.health.level)
      if (filter === "healthy") return r.i?.health.level === "healthy"
      if (filter === "new") return r.i?.health.level === "new"
      if (filter === "trials") return isTrialEnding(r)
      if (filter === "followups") return followUpDue(r)
      return true
    })
    .filter((r) => {
      const s = q.trim().toLowerCase()
      return !s || r.t.name.toLowerCase().includes(s) || (r.t.owner_email ?? "").toLowerCase().includes(s)
    })
    .sort((a, b) => {
      const ai = a.i, bi = b.i
      switch (sort) {
        case "active": return (bi?.lastActiveAt ?? 0) - (ai?.lastActiveAt ?? 0)
        case "sales": return (bi?.revenue30 ?? 0) - (ai?.revenue30 ?? 0)
        case "profit": return (bi?.profit30 ?? 0) - (ai?.profit30 ?? 0)
        case "stock": return (bi?.stockCost ?? 0) - (ai?.stockCost ?? 0)
        case "newest": return new Date(b.t.created_at).getTime() - new Date(a.t.created_at).getTime()
        default:
          // Needs attention first; among equals, the biggest earners first (worth the call).
          return (bi?.health.urgency ?? 0) - (ai?.health.urgency ?? 0) || (bi?.revenuePrev30 ?? 0) - (ai?.revenuePrev30 ?? 0)
      }
    })

  const p = insights?.platform
  const chips: Array<[Filter, string]> = [
    ["all", "All"], ["attention", "Needs attention"], ["healthy", "Healthy"], ["new", "Getting started"], ["trials", "Trials ending"], ["followups", "Follow-ups due"],
  ]

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between mb-6 gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pharmacies</h1>
          <p className="text-sm text-[var(--pt-text-secondary)] mt-0.5">
            {p ? `${p.tenants} on PharmaTrack · ${p.newSignups30} joined in the last 30 days` : "Pharmacies on PharmaTrack"}
          </p>
        </div>
        <button onClick={() => setProvision(true)} className="inline-flex items-center gap-2 px-4 h-9 rounded-lg bg-[var(--pt-green)] text-white text-sm font-semibold hover:bg-[var(--pt-green-600)] transition-colors shrink-0">
          <Plus size={16} /> Add pharmacy
        </button>
      </div>

      {/* Platform totals */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-4">
        {insightsLoading || !p ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-[92px] rounded-xl border border-[var(--pt-border)] bg-[var(--pt-surface)] animate-pulse" />) : (
          <>
            <Kpi label="Monthly subscriptions" value={kesShort(p.mrr)} sub={`${kesShort(p.collected30)} collected · 30d`} />
            <Kpi label="Active this week" value={`${p.active7} of ${p.tenants}`} sub={`${Math.round((p.active7 / Math.max(1, p.tenants)) * 100)}% of pharmacies`} />
            <Kpi label="Need attention" value={p.atRisk} sub="tap to see who" onClick={() => setFilter("attention")} active={filter === "attention"} />
            <Kpi label="Sales through PharmaTrack" value={kesShort(p.revenue30)} sub="last 30 days" />
            <Kpi label="Their profit" value={kesShort(p.profit30)} sub={p.revenue30 > 0 ? `${Math.round((p.profit30 / p.revenue30) * 100)}% margin · 30d` : "last 30 days"} />
            <Kpi label="Stock they hold" value={kesShort(p.stockCost)} sub={`at cost · sells for ${kesShort(p.stockRetail)}`} />
          </>
        )}
      </div>

      {/* Trends */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <Card title="Sales through PharmaTrack · last 30 days">
          {insights ? <DailyBars data={insights.daily} dataKey="revenue" name="Sales" /> : <div className="h-[180px] animate-pulse rounded-lg bg-[var(--pt-muted)]" />}
        </Card>
        <Card title="Pharmacies active each day">
          {insights ? <DailyBars data={insights.daily} dataKey="activePharmacies" name="Active pharmacies" money={false} color="var(--pt-viz-profit)" /> : <div className="h-[180px] animate-pulse rounded-lg bg-[var(--pt-muted)]" />}
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-3">
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Filter pharmacies">
          {chips.map(([k, label]) => (
            <button key={k} role="radio" aria-checked={filter === k} onClick={() => setFilter(k)}
              className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-sm font-medium border transition-colors ${filter === k ? "bg-[var(--pt-text)] text-[var(--pt-surface)] border-[var(--pt-text)]" : "border-[var(--pt-border)] text-[var(--pt-text-secondary)] hover:bg-[var(--pt-muted)]"}`}>
              {label}
              <span className={`text-xs tabular-nums ${filter === k ? "opacity-80" : "text-[var(--pt-text-tertiary)]"}`}>{counts[k]}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-2 lg:ml-auto">
          <div className="relative flex-1 lg:w-64">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--pt-text-tertiary)]" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search pharmacy or owner email" aria-label="Search pharmacies"
              className="w-full h-9 pl-9 pr-3 rounded-lg border border-[var(--pt-border)] bg-[var(--pt-surface)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pt-green)]" />
          </div>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort"
            className="h-9 rounded-lg border border-[var(--pt-border)] bg-[var(--pt-surface)] px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pt-green)]">
            <option value="attention">Needs attention first</option>
            <option value="active">Recently active</option>
            <option value="sales">Most sales</option>
            <option value="profit">Most profit</option>
            <option value="stock">Most stock</option>
            <option value="newest">Newest</option>
          </select>
        </div>
      </div>

      {/* Pharmacies */}
      <div className="bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] overflow-hidden">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="px-5 py-4 border-b border-[var(--pt-border)] last:border-b-0 animate-pulse">
              <div className="h-3.5 bg-[var(--pt-muted-strong)] rounded w-48 mb-2" />
              <div className="h-2.5 bg-[var(--pt-muted-strong)] rounded w-64" />
            </div>
          ))
        ) : tenants.length === 0 ? (
          <div className="px-5 py-12 flex flex-col items-center text-center text-sm text-[var(--pt-text-tertiary)]">
            <Building2 size={32} strokeWidth={1.5} className="mb-3" /> No pharmacies yet
          </div>
        ) : shown.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-[var(--pt-text-tertiary)]">
            No pharmacies match.{" "}
            <button onClick={() => { setFilter("all"); setQ("") }} className="font-semibold text-[var(--pt-green-600)] hover:underline">Show all</button>
          </div>
        ) : (
          <>
          {/* Phones: one card per pharmacy (the table needs a wide screen) */}
          <ul className="sm:hidden divide-y divide-[var(--pt-border)]">
            {shown.map(({ t, i }) => (
              <li key={t.id}>
                <Link href={`/platform/${t.id}`} className="block px-4 py-3.5 active:bg-[var(--pt-muted)]">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{t.name}</p>
                      <p className="text-[11px] text-[var(--pt-text-tertiary)] truncate">{t.owner_email ?? t.email ?? "—"}</p>
                    </div>
                    {i && <HealthBadge level={i.health.level} label={i.health.label} />}
                  </div>
                  {i?.health.reasons[0] && <p className="text-xs text-[var(--pt-text-secondary)] mt-1.5">{i.health.reasons[0]}</p>}
                  <div className="flex items-center justify-between gap-2 mt-2 text-xs text-[var(--pt-text-secondary)]">
                    <span>Active {i ? ago(i.lastActiveAt, now).toLowerCase() : "…"}</span>
                    <span className="tabular-nums"><span className="font-semibold text-[var(--pt-text)]">{i ? kesShort(i.revenue30 ?? 0) : "…"}</span> sales · 30d</span>
                  </div>
                  {i?.followUpOn && (
                    <p className={`mt-1 text-[11px] font-semibold inline-flex items-center gap-1 ${i.followUpOn <= today ? "text-[var(--pt-red)]" : "text-[var(--pt-text-secondary)]"}`}>
                      <CalendarClock size={11} /> Follow up {i.followUpOn <= today ? "due" : followUpLabel(i.followUpOn)}
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--pt-border)] bg-[var(--pt-muted)] text-[11px] font-semibold text-[var(--pt-text-secondary)] uppercase tracking-wide">
                  <th className="px-5 py-3 text-left">Pharmacy</th>
                  <th className="px-3 py-3 text-left">Health</th>
                  <th className="px-3 py-3 text-left hidden md:table-cell">Last active</th>
                  <th className="px-3 py-3 text-right">Sales · 30d</th>
                  <th className="px-3 py-3 text-right hidden lg:table-cell">Profit · 30d</th>
                  <th className="px-3 py-3 text-right hidden xl:table-cell">Stock (cost)</th>
                  <th className="px-3 py-3 text-left hidden lg:table-cell">Trend</th>
                  <th className="px-3 py-3 text-left hidden sm:table-cell">Plan</th>
                  <th className="px-2 py-3" aria-hidden />
                </tr>
              </thead>
              <tbody>
                {shown.map(({ t, i }) => (
                  <tr key={t.id} onClick={() => router.push(`/platform/${t.id}`)}
                    className="border-b border-[var(--pt-border)] last:border-b-0 hover:bg-[var(--pt-muted)]/70 transition-colors cursor-pointer">
                    <td className="px-5 py-3.5 max-w-[260px]">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Link href={`/platform/${t.id}`} onClick={(e) => e.stopPropagation()} className="font-semibold hover:text-[var(--pt-green-600)] truncate">{t.name}</Link>
                        {t.repeat_trial && <span title="Another trial used the same email, Google account or PPB registration number" className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold border bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30">Repeat trial</span>}
                        {!t.repeat_trial && t.shared_ip && <span title="Signed up from the same network (IP) as another pharmacy" className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold border bg-[var(--pt-muted)] text-[var(--pt-text-secondary)] border-[var(--pt-border)]">Suspected duplicate</span>}
                        {!!t.pending_trial_requests && <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold border bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-500/30">Trial request</span>}
                      </div>
                      <p className="text-[11px] text-[var(--pt-text-tertiary)] truncate">
                        {t.owner_email ?? t.email ?? "—"}
                        {i?.followUpOn && (
                          <span className={`ml-1.5 inline-flex items-center gap-0.5 font-semibold ${i.followUpOn <= today ? "text-[var(--pt-red)]" : "text-[var(--pt-text-secondary)]"}`}>
                            <CalendarClock size={11} /> follow up {i.followUpOn <= today ? "due" : followUpLabel(i.followUpOn)}
                          </span>
                        )}
                      </p>
                    </td>
                    <td className="px-3 py-3.5">
                      {i ? (
                        <div title={i.health.reasons.join(" · ") || i.health.label}>
                          <HealthBadge level={i.health.level} label={i.health.label} />
                          {i.health.reasons[0] && <p className="text-[11px] text-[var(--pt-text-tertiary)] mt-1 max-w-[180px] truncate">{i.health.reasons[0]}</p>}
                        </div>
                      ) : <span className="inline-block w-20 h-5 rounded-full bg-[var(--pt-muted-strong)] animate-pulse" />}
                    </td>
                    <td className="px-3 py-3.5 text-[var(--pt-text-secondary)] whitespace-nowrap hidden md:table-cell">{i ? ago(i.lastActiveAt, now) : "…"}</td>
                    <td className="px-3 py-3.5 text-right whitespace-nowrap">
                      <p className="font-semibold tabular-nums">{i ? kesShort(i.revenue30 ?? 0) : "…"}</p>
                      {i && (i.revenue30 || i.revenuePrev30) ? <Delta value={change(i.revenue30 ?? 0, i.revenuePrev30 ?? 0)} /> : null}
                    </td>
                    <td className="px-3 py-3.5 text-right tabular-nums whitespace-nowrap hidden lg:table-cell">{i ? kesShort(i.profit30 ?? 0) : "…"}</td>
                    <td className="px-3 py-3.5 text-right tabular-nums whitespace-nowrap hidden xl:table-cell text-[var(--pt-text-secondary)]">{i ? kesShort(i.stockCost ?? 0) : "…"}</td>
                    <td className="px-3 py-3.5 hidden lg:table-cell">{i?.spark30 ? <Sparkline values={i.spark30} /> : null}</td>
                    <td className="px-3 py-3.5 hidden sm:table-cell">
                      <div className="flex flex-col items-start gap-1">
                        <StatusBadge status={t.subscription?.status ?? null} />
                        <span className="text-[11px] text-[var(--pt-text-tertiary)] whitespace-nowrap">
                          {t.plan_name ?? "No plan"} · {t.subscription?.status === "trialing" ? "ends" : "renews"} {fmtDate((t.subscription?.status === "trialing" ? t.subscription?.trial_ends_at : t.subscription?.current_period_end) ?? null)}
                        </span>
                      </div>
                    </td>
                    <td className="px-2 py-3.5 text-[var(--pt-text-tertiary)]"><ChevronRight size={16} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>
      <p className="text-[11px] text-[var(--pt-text-tertiary)] mt-2">
        Health: inactive = no use for 14+ days · at risk = 8–14 days · slipping = 4–7 days or sales halved · never started = no sale 7+ days after signing up. Sign-in history counts from 23 Oct 2026.
      </p>

      {/* Cross-tenant data export for analytics / ML */}
      <details className="mt-6 bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] p-5 group">
        <summary className="flex items-center gap-2 cursor-pointer list-none">
          <Download size={16} className="text-[var(--pt-text-secondary)]" />
          <span className="text-sm font-semibold">Data export</span>
          <span className="text-xs text-[var(--pt-text-tertiary)]">Cross-tenant CSV for analytics</span>
          <ChevronRight size={15} className="ml-auto text-[var(--pt-text-tertiary)] transition-transform group-open:rotate-90" />
        </summary>
        <div className="flex flex-wrap gap-2 mt-3">
          {([["sales", "Sales (line items)"], ["products", "Products"], ["stats", "Tenant stats"]] as const).map(([ds, label]) => (
            <a key={ds} href={`/api/platform/export?dataset=${ds}&format=csv`}
              className="inline-flex items-center gap-2 px-3.5 h-9 rounded-lg border border-[var(--pt-border)] text-sm font-semibold text-[var(--pt-text-secondary)] hover:bg-[var(--pt-muted)] transition-colors">
              <Download size={14} /> {label} CSV
            </a>
          ))}
        </div>
      </details>

      {provision && <ProvisionDialog open={provision} onOpenChange={setProvision} />}
    </div>
  )
}
