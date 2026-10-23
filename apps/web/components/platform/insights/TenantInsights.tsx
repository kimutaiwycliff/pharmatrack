"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Check, Circle, Loader2, Monitor, Smartphone, Globe } from "lucide-react"
import type { Health } from "@/lib/insights/health"
import type { TenantDetailInsights } from "@/lib/insights/queries"
import { ActivityCalendar, BusyHours, PaymentMix, SalesProfitChart } from "./charts"
import { FollowUpPanel } from "./FollowUpPanel"
import { ago, Card, change, Empty, HealthBadge, Kpi, kes, kesShort, shortDate } from "./ui"

// Operator view of one pharmacy: Overview (money + health + follow-up),
// Usage (when and how they use it, what they sell, which features), and
// Team & devices. Data: GET /api/platform/tenants/[orgId]/insights.

export type InsightsTab = "overview" | "usage" | "team"

export interface TenantInsightsData extends TenantDetailInsights {
  health: Health
  period: number
  contact: { pharmacy: string; name: string | null; email: string | null; phone: string | null }
}

export function useTenantInsights(orgId: string) {
  return useQuery<TenantInsightsData>({
    queryKey: ["tenant-insights", orgId],
    queryFn: async () => {
      const res = await fetch(`/api/platform/tenants/${orgId}/insights`)
      if (!res.ok) throw new Error("Couldn't load insights")
      return res.json() as Promise<TenantInsightsData>
    },
    staleTime: 60_000,
  })
}

/** Health line under the pharmacy name: badge + why + last activity. */
export function TenantHealthLine({ orgId }: { orgId: string }) {
  const { data } = useTenantInsights(orgId)
  if (!data) return <div className="h-6" />
  const s = data.summary
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-2">
      <HealthBadge level={data.health.level} label={data.health.label} size="md" />
      <span className="text-sm text-[var(--pt-text-secondary)]">
        Last active <strong className="text-[var(--pt-text)] font-semibold">{ago(s.lastActiveAt)}</strong>
        {" · "}last sale {ago(s.lastSaleAt).toLowerCase()}
        {" · "}last sign-in {s.lastLoginAt ? ago(s.lastLoginAt).toLowerCase() : "not recorded yet"}
      </span>
    </div>
  )
}

export function TenantInsightsTab({ orgId, tab }: { orgId: string; tab: InsightsTab }) {
  const { data, isLoading, isError, refetch } = useTenantInsights(orgId)
  if (isLoading) {
    return <div className="flex items-center gap-2 text-sm text-[var(--pt-text-secondary)] py-10"><Loader2 size={16} className="animate-spin" /> Loading insights…</div>
  }
  if (isError || !data) {
    return (
      <Card><div className="text-sm">Couldn&apos;t load this pharmacy&apos;s insights. <button onClick={() => void refetch()} className="font-semibold text-[var(--pt-green-600)] hover:underline">Try again</button></div></Card>
    )
  }
  if (tab === "usage") return <Usage d={data} />
  if (tab === "team") return <Team d={data} />
  return <Overview orgId={orgId} d={data} />
}

// ── Overview ─────────────────────────────────────────────────────────────────

function Overview({ orgId, d }: { orgId: string; d: TenantInsightsData }) {
  const [range, setRange] = useState<30 | 90>(30)
  const s = d.summary
  const margin = s.revenue30 > 0 ? Math.round((s.profit30 / s.revenue30) * 100) : null
  const activeStaffTotal = d.staff.filter((x) => x.active).length
  const trialEnding = d.health.reasons.some((r) => r.startsWith("Trial ends"))
  const series = d.daily.slice(-range)

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      <div className="xl:col-span-2 space-y-4">
        {d.health.reasons.length > 0 && d.health.level !== "healthy" && (
          <div className="rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-4 py-3">
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">Why it&apos;s {d.health.label.toLowerCase()}</p>
            <ul className="mt-1 text-sm text-amber-900/90 dark:text-amber-200/90 list-disc pl-5 space-y-0.5">
              {d.health.reasons.map((r) => <li key={r}>{r}</li>)}
            </ul>
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi label="Sales · 30 days" value={kesShort(s.revenue30)} delta={change(s.revenue30, s.prev.revenue30)} />
          <Kpi label="Profit · 30 days" value={kesShort(s.profit30)} delta={change(s.profit30, s.prev.profit30)} sub={margin != null ? `${margin}% margin` : undefined} />
          <Kpi label="Transactions" value={s.sales30.toLocaleString("en-KE")} delta={change(s.sales30, s.prev.sales30)} sub={s.sales30 ? `avg ${kes(s.avgBasket30)}` : undefined} />
          <Kpi label="Stock value (cost)" value={kesShort(d.stock.cost)} sub={`sells for ${kesShort(d.stock.retail)}`} />
          <Kpi label="Active days" value={`${s.activeDays30} / 30`} sub="days with use or sales" />
          <Kpi label="Sign-ins · 30 days" value={s.logins30.toLocaleString("en-KE")} delta={change(s.logins30, s.prev.logins30)} />
          <Kpi label="Staff active" value={`${s.activeStaff30} of ${activeStaffTotal}`} sub="this month" />
          <Kpi label="Lifetime sales" value={kesShort(s.lifetimeRevenue)} sub={`${s.lifetimeSales.toLocaleString("en-KE")} transactions`} />
        </div>

        <Card
          title="Sales and profit"
          action={
            <div className="flex rounded-lg border border-[var(--pt-border)] p-0.5 text-xs" role="radiogroup" aria-label="Period">
              {([30, 90] as const).map((r) => (
                <button key={r} role="radio" aria-checked={range === r} onClick={() => setRange(r)}
                  className={`px-2.5 h-6 rounded-md font-medium ${range === r ? "bg-[var(--pt-muted-strong)] text-[var(--pt-text)]" : "text-[var(--pt-text-secondary)]"}`}>{r} days</button>
              ))}
            </div>
          }
        >
          {series.some((x) => x.revenue > 0) ? <SalesProfitChart data={series} /> : <Empty>No sales in the last {range} days.</Empty>}
          <p className="text-[11px] text-[var(--pt-text-tertiary)] mt-1">Profit = sales minus cost of the items sold (same as the pharmacy&apos;s own Reports). Items with no cost price are left out of profit.</p>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card title="Stock on the shelves">
            <dl className="space-y-2 text-sm">
              <Row k="At cost" v={kes(d.stock.cost)} strong />
              <Row k="At selling price" v={kes(d.stock.retail)} />
              <Row k="Profit if all sold" v={kes(d.stock.potentialProfit)} />
              <Row k="Expired (at cost)" v={kes(d.stock.expiredCost)} warn={d.stock.expiredCost > 0} />
              <Row k="Products in stock" v={d.stock.products.toLocaleString("en-KE")} />
              {d.stock.missingCost > 0 && <p className="text-[11px] text-[var(--pt-text-tertiary)]">{d.stock.missingCost} product{d.stock.missingCost === 1 ? " has" : "s have"} no cost price and {d.stock.missingCost === 1 ? "is" : "are"} left out of the value.</p>}
            </dl>
          </Card>
          <Card title="What they pay PharmaTrack">
            <dl className="space-y-2 text-sm">
              <Row k="Paid to date" v={kes(s.paidToUs)} strong />
              <Row k="Customer since" v={shortDate(d.milestones.signed_up)} />
              <Row k="First payment" v={shortDate(d.milestones.first_payment)} />
            </dl>
          </Card>
        </div>
      </div>

      <div className="space-y-4">
        <FollowUpPanel orgId={orgId} contact={d.contact} level={d.health.level} trialEnding={trialEnding} />
        <Milestones m={d.milestones} />
      </div>
    </div>
  )
}

function Row({ k, v, strong, warn }: { k: string; v: string; strong?: boolean; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-[var(--pt-text-secondary)]">{k}</dt>
      <dd className={`tabular-nums ${strong ? "font-bold" : "font-medium"} ${warn ? "text-[var(--pt-red)]" : ""}`}>{v}</dd>
    </div>
  )
}

function Milestones({ m }: { m: Record<string, number | null> }) {
  const steps: Array<[string, string]> = [
    ["signed_up", "Signed up"], ["first_product", "Added products"], ["first_stock", "Received stock"],
    ["first_sale", "First sale"], ["tenth_sale", "10th sale"], ["first_payment", "First payment"],
  ]
  const nextIdx = steps.findIndex(([k]) => m[k] == null)
  return (
    <Card title="Getting set up">
      <ol className="space-y-2.5">
        {steps.map(([k, label], i) => {
          const at = m[k]
          const next = i === nextIdx
          return (
            <li key={k} className="flex items-center gap-2.5 text-sm">
              {at != null
                ? <span className="w-5 h-5 rounded-full bg-[var(--pt-green)] text-white flex items-center justify-center shrink-0"><Check size={12} strokeWidth={3} /></span>
                : <Circle size={20} className={`shrink-0 ${next ? "text-amber-500" : "text-[var(--pt-border-strong)]"}`} />}
              <span className={`flex-1 ${at == null ? "text-[var(--pt-text-secondary)]" : ""}`}>{label}{next && <span className="ml-1.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">next step</span>}</span>
              <span className="text-xs text-[var(--pt-text-tertiary)] tabular-nums">{at != null ? shortDate(at) : "—"}</span>
            </li>
          )
        })}
      </ol>
    </Card>
  )
}

// ── Usage ────────────────────────────────────────────────────────────────────

const FEATURES: Array<{ key: string; label: string; done: (v: number | boolean) => boolean; show: (v: number | boolean) => string }> = [
  { key: "priced", label: "Products priced", done: (v) => Number(v) > 0, show: (v) => `${Number(v).toLocaleString("en-KE")}` },
  { key: "batches", label: "Stock received", done: (v) => Number(v) > 0, show: (v) => `${Number(v).toLocaleString("en-KE")} batches` },
  { key: "shifts30", label: "Shifts (till sessions)", done: (v) => Number(v) > 0, show: (v) => `${v} this month` },
  { key: "purchase_orders", label: "Purchase orders", done: (v) => Number(v) > 0, show: (v) => `${v}` },
  { key: "customers", label: "Customer records", done: (v) => Number(v) > 0, show: (v) => `${v}` },
  { key: "appointments30", label: "Appointments", done: (v) => Number(v) > 0, show: (v) => `${v} this month` },
  { key: "prescriptions30", label: "Prescriptions", done: (v) => Number(v) > 0, show: (v) => `${v} this month` },
  { key: "devices", label: "Offline tills / phones", done: (v) => Number(v) > 0, show: (v) => `${v} registered` },
  { key: "mpesa", label: "M-Pesa prompts (STK)", done: (v) => v === true, show: (v) => (v ? "set up" : "not set up") },
  { key: "branches", label: "Branches", done: (v) => Number(v) > 1, show: (v) => `${v}` },
]

function Usage({ d }: { d: TenantInsightsData }) {
  const totalPings = Object.values(d.apps).reduce((s, v) => s + v, 0)
  const apps: Array<[string, string, React.ComponentType<{ size?: number }>]> = [["web", "Browser", Globe], ["desktop", "Desktop app", Monitor], ["android", "Android app", Smartphone]]
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card title={`Days in use · last ${d.period} days`} className="lg:col-span-2"><ActivityCalendar days={d.daily} /></Card>
      <Card title="Busiest times · sales by hour (90 days)">{d.heat.length ? <BusyHours cells={d.heat} /> : <Empty>No sales yet.</Empty>}</Card>
      <Card title="How customers pay · 30 days"><PaymentMix mix={d.paymentMix} /></Card>
      <Card title="Top products · 30 days">
        {d.topProducts.length === 0 ? <Empty>No sales in the last 30 days.</Empty> : (
          <table className="w-full text-sm">
            <thead><tr className="text-[11px] text-[var(--pt-text-tertiary)] text-left"><th className="font-medium pb-1.5">Product</th><th className="font-medium pb-1.5 text-right">Qty</th><th className="font-medium pb-1.5 text-right">Sales</th><th className="font-medium pb-1.5 text-right">Profit</th></tr></thead>
            <tbody>
              {d.topProducts.map((p) => (
                <tr key={p.name} className="border-t border-[var(--pt-border)]">
                  <td className="py-1.5 pr-2 truncate max-w-[180px]">{p.name}</td>
                  <td className="py-1.5 text-right tabular-nums">{p.qty.toLocaleString("en-KE")}</td>
                  <td className="py-1.5 text-right tabular-nums">{kesShort(p.revenue)}</td>
                  <td className="py-1.5 text-right tabular-nums text-[var(--pt-text-secondary)]">{p.profit == null ? "—" : kesShort(p.profit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <Card title="Features in use">
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
          {FEATURES.map((f) => {
            const v = d.adoption[f.key] ?? 0
            const on = f.done(v)
            return (
              <li key={f.key} className="flex items-center gap-2 text-sm">
                {on ? <Check size={15} className="text-[var(--pt-green)] shrink-0" /> : <Circle size={15} className="text-[var(--pt-border-strong)] shrink-0" />}
                <span className={on ? "" : "text-[var(--pt-text-secondary)]"}>{f.label}</span>
                <span className="ml-auto text-xs text-[var(--pt-text-tertiary)] tabular-nums">{f.show(v)}</span>
              </li>
            )
          })}
        </ul>
        <p className="text-[11px] text-[var(--pt-text-tertiary)] mt-3">Grey items are worth a short training call.</p>
      </Card>
      <Card title="Which app they use · 30 days">
        {totalPings === 0 ? <Empty>No app usage recorded yet — this starts counting from today.</Empty> : (
          <ul className="space-y-2.5">
            {apps.map(([k, label, Icon]) => {
              const share = (d.apps[k] ?? 0) / totalPings
              return (
                <li key={k} className="text-sm">
                  <div className="flex items-center justify-between mb-1"><span className="flex items-center gap-1.5"><Icon size={14} /> {label}</span><span className="tabular-nums font-semibold">{Math.round(share * 100)}%</span></div>
                  <div className="h-1.5 rounded-full bg-[var(--pt-muted-strong)]"><div className="h-1.5 rounded-full bg-[var(--pt-viz-sales)]" style={{ width: `${share * 100}%` }} /></div>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
      <Card title="Branches · 30 days">
        <table className="w-full text-sm">
          <thead><tr className="text-[11px] text-[var(--pt-text-tertiary)] text-left"><th className="font-medium pb-1.5">Branch</th><th className="font-medium pb-1.5 text-right">Sales</th><th className="font-medium pb-1.5 text-right">Transactions</th><th className="font-medium pb-1.5 text-right">Stock (cost)</th></tr></thead>
          <tbody>
            {d.branches.map((b) => (
              <tr key={b.id} className="border-t border-[var(--pt-border)]">
                <td className="py-1.5">{b.name}{!b.active && <span className="ml-1 text-[11px] text-[var(--pt-text-tertiary)]">(closed)</span>}</td>
                <td className="py-1.5 text-right tabular-nums">{kesShort(b.revenue30)}</td>
                <td className="py-1.5 text-right tabular-nums">{b.sales30}</td>
                <td className="py-1.5 text-right tabular-nums">{kesShort(b.stockCost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

// ── Team & devices ──────────────────────────────────────────────────────────

function Team({ d }: { d: TenantInsightsData }) {
  const [now] = useState(() => Date.now())
  return (
    <div className="space-y-4">
      <Card title={`Staff · ${d.staff.length}`}>
        <div className="overflow-x-auto -mx-5 px-5">
          <table className="w-full text-sm min-w-[640px]">
            <thead><tr className="text-[11px] text-[var(--pt-text-tertiary)] text-left">
              <th className="font-medium pb-2">Name</th><th className="font-medium pb-2">Role</th><th className="font-medium pb-2">Last active</th>
              <th className="font-medium pb-2 text-right">Sign-ins (30d)</th><th className="font-medium pb-2 text-right">Active days</th><th className="font-medium pb-2 text-right">Sales (30d)</th>
            </tr></thead>
            <tbody>
              {d.staff.map((s) => {
                const stale = s.lastSeenAt == null || now - s.lastSeenAt > 14 * 86_400_000
                return (
                  <tr key={s.id} className="border-t border-[var(--pt-border)]">
                    <td className="py-2"><p className="font-medium">{s.name}{!s.active && <span className="ml-1.5 text-[11px] text-[var(--pt-text-tertiary)]">deactivated</span>}</p><p className="text-[11px] text-[var(--pt-text-tertiary)]">{s.email ?? "—"}</p></td>
                    <td className="py-2 capitalize text-[var(--pt-text-secondary)]">{s.role}</td>
                    <td className={`py-2 ${stale && s.active ? "text-amber-700 dark:text-amber-300 font-medium" : ""}`}>{ago(s.lastSeenAt)}</td>
                    <td className="py-2 text-right tabular-nums">{s.logins30}</td>
                    <td className="py-2 text-right tabular-nums">{s.activeDays30}</td>
                    <td className="py-2 text-right tabular-nums">{s.sales30 ? `${s.sales30} · ${kesShort(s.revenue30)}` : "—"}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title={`Selling devices · ${d.devices.filter((x) => !x.revoked).length}`}>
        {d.devices.length === 0 ? <Empty>No phones or computers set up for offline selling.</Empty> : (
          <div className="overflow-x-auto -mx-5 px-5">
            <table className="w-full text-sm min-w-[560px]">
              <thead><tr className="text-[11px] text-[var(--pt-text-tertiary)] text-left">
                <th className="font-medium pb-2">Device</th><th className="font-medium pb-2">Type</th><th className="font-medium pb-2">Branch</th><th className="font-medium pb-2">Last seen</th><th className="font-medium pb-2">Last sync</th>
              </tr></thead>
              <tbody>
                {d.devices.map((v) => {
                  const lateSync = !v.revoked && (v.lastSyncAt == null || now - v.lastSyncAt > 86_400_000)
                  return (
                    <tr key={v.id} className={`border-t border-[var(--pt-border)] ${v.revoked ? "opacity-50" : ""}`}>
                      <td className="py-2 font-medium">{v.name} <span className="font-mono text-[11px] text-[var(--pt-text-tertiary)]">{v.code}</span>{v.revoked && <span className="ml-1 text-[11px]">(removed)</span>}</td>
                      <td className="py-2 capitalize text-[var(--pt-text-secondary)]">{v.platform ?? "—"}</td>
                      <td className="py-2 text-[var(--pt-text-secondary)]">{v.branch ?? "—"}</td>
                      <td className="py-2">{ago(v.lastSeenAt)}</td>
                      <td className={`py-2 ${lateSync ? "text-amber-700 dark:text-amber-300 font-medium" : ""}`}>{ago(v.lastSyncAt)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
