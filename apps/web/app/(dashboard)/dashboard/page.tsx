"use client"

import { useQuery } from "@tanstack/react-query"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts"
import { TrendingUp, ShoppingCart, CreditCard, Smartphone, AlertTriangle, PackageX, Clock } from "lucide-react"
import { useUIStore } from "@/lib/store/uiStore"
import { formatKES } from "@/lib/store/cartStore"

interface DashboardData {
  kpis: {
    todayRevenue: number
    todayTransactions: number
    todayAvgBasket: number
    mpesaRate: number
  }
  chartData: Array<{
    date: string
    total: number
    cash: number
    mpesa: number
    transactions: number
  }>
  topProducts: Array<{
    product_id: string
    name: string
    revenue: number
    qty: number
  }>
  recentTransactions: Array<{
    id: string
    receipt_number: string
    total_amount: number
    payment_method: string
    customer_name: string | null
    created_at: string
  }>
  alerts: { outOfStock: number; lowStock: number; expiring: number }
}

function useDashboard(branchId: string | null) {
  return useQuery<DashboardData>({
    queryKey: ["dashboard", branchId],
    queryFn: async () => {
      const res = await fetch(`/api/dashboard?branch_id=${branchId}`)
      if (!res.ok) throw new Error("Failed to load dashboard")
      return res.json() as Promise<DashboardData>
    },
    enabled: !!branchId,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  })
}

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  iconClass,
}: {
  icon: React.ElementType
  label: string
  value: string
  sub?: string
  iconClass?: string
}) {
  return (
    <div className="bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-[var(--pt-text-secondary)] uppercase tracking-wide">{label}</p>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${iconClass ?? "bg-[var(--pt-muted-strong)] text-[var(--pt-text-secondary)]"}`}>
          <Icon size={16} />
        </div>
      </div>
      <p className="text-2xl font-bold tracking-tight tabular-nums">{value}</p>
      {sub && <p className="text-xs text-[var(--pt-text-tertiary)] mt-1">{sub}</p>}
    </div>
  )
}

function KpiSkeleton() {
  return <div className="bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] p-5 animate-pulse h-28" />
}

function shortDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-KE", {
    weekday: "short", timeZone: "Africa/Nairobi",
  })
}

function timeStr(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString("en-KE", {
    hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi",
  })
}

const PAYMENT_ICON: Record<string, string> = {
  cash: "💵",
  mpesa: "📱",
  split: "⚡",
  card: "💳",
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartTooltipContent({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] shadow-lg p-3 text-xs">
      <p className="font-bold mb-2">{label}</p>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 rounded-full" style={{ background: p.fill }} />
          <span className="text-[var(--pt-text-secondary)]">{p.name}:</span>
          <span className="font-semibold">{formatKES(p.value as number)}</span>
        </div>
      ))}
    </div>
  )
}

export default function DashboardPage() {
  const branchId = useUIStore((s) => s.activeBranchId)
  const { data, isLoading } = useDashboard(branchId)

  const todayLabel = new Date().toLocaleDateString("en-KE", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    timeZone: "Africa/Nairobi",
  })

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <p className="text-xs font-medium text-[var(--pt-text-secondary)] uppercase tracking-wide mb-1">
          {todayLabel}
        </p>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <KpiSkeleton key={i} />)
        ) : (
          <>
            <KpiCard
              icon={TrendingUp}
              label="Today's Revenue"
              value={formatKES(data?.kpis.todayRevenue ?? 0)}
              sub="completed sales"
              iconClass="bg-[var(--pt-green-50)] text-[var(--pt-green-600)]"
            />
            <KpiCard
              icon={ShoppingCart}
              label="Transactions"
              value={String(data?.kpis.todayTransactions ?? 0)}
              sub="today"
              iconClass="bg-blue-50 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400"
            />
            <KpiCard
              icon={CreditCard}
              label="Avg Basket"
              value={formatKES(data?.kpis.todayAvgBasket ?? 0)}
              sub="per transaction"
              iconClass="bg-purple-50 text-purple-600"
            />
            <KpiCard
              icon={Smartphone}
              label="M-Pesa Rate"
              value={`${(data?.kpis.mpesaRate ?? 0).toFixed(1)}%`}
              sub="of today's revenue"
              iconClass="bg-[var(--pt-green-50)] text-[var(--pt-green-600)]"
            />
          </>
        )}
      </div>

      {/* Alerts row */}
      {data && (data.alerts.outOfStock > 0 || data.alerts.lowStock > 0 || data.alerts.expiring > 0) && (
        <div className="flex flex-wrap gap-3 mb-5">
          {data.alerts.outOfStock > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-50 dark:bg-red-500/15 border border-red-100 rounded-lg text-sm text-red-700 dark:text-red-300 font-medium">
              <PackageX size={14} />
              {data.alerts.outOfStock} out of stock
            </div>
          )}
          {data.alerts.lowStock > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-500/15 border border-amber-100 rounded-lg text-sm text-amber-700 dark:text-amber-300 font-medium">
              <AlertTriangle size={14} />
              {data.alerts.lowStock} low stock
            </div>
          )}
          {data.alerts.expiring > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 bg-yellow-50 dark:bg-yellow-500/15 border border-yellow-100 rounded-lg text-sm text-yellow-700 dark:text-yellow-300 font-medium">
              <Clock size={14} />
              {data.alerts.expiring} expiring within 90 days
            </div>
          )}
        </div>
      )}

      {/* Chart + Top Products */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        {/* Revenue Chart */}
        <div className="lg:col-span-2 bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] p-5">
          <p className="text-sm font-bold mb-4">Revenue — Last 7 Days</p>
          {isLoading ? (
            <div className="h-52 bg-[var(--pt-muted)] rounded-xl animate-pulse" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data?.chartData ?? []} barSize={20} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--pt-border)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={shortDate}
                  tick={{ fontSize: 11, fill: "var(--pt-text-tertiary)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`}
                  tick={{ fontSize: 11, fill: "var(--pt-text-tertiary)" }}
                  axisLine={false}
                  tickLine={false}
                  width={36}
                />
                <Tooltip content={<ChartTooltipContent />} cursor={{ fill: "var(--pt-border)", opacity: 0.5 }} />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: 11, paddingTop: 12 }}
                />
                <Bar dataKey="cash" name="Cash" fill="#22c55e" radius={[3, 3, 0, 0]} stackId="a" />
                <Bar dataKey="mpesa" name="M-Pesa" fill="#16a34a" radius={[3, 3, 0, 0]} stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Top Products */}
        <div className="bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] p-5">
          <p className="text-sm font-bold mb-4">Top Products · 30 Days</p>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-9 bg-[var(--pt-muted-strong)] rounded-lg animate-pulse" />
              ))}
            </div>
          ) : !data?.topProducts.length ? (
            <p className="text-sm text-[var(--pt-text-tertiary)] text-center py-8">No sales yet</p>
          ) : (
            <div className="space-y-3">
              {data.topProducts.map((p, i) => {
                const maxRevenue = data.topProducts[0]?.revenue ?? 1
                const pct = Math.round((p.revenue / maxRevenue) * 100)
                return (
                  <div key={p.product_id}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[11px] font-bold text-[var(--pt-text-tertiary)] w-4 shrink-0">
                          {i + 1}
                        </span>
                        <span className="text-[13px] font-semibold truncate">{p.name}</span>
                      </div>
                      <span className="text-[12px] font-bold tabular-nums shrink-0 ml-2">
                        {formatKES(p.revenue)}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[var(--pt-muted-strong)] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[var(--pt-green)]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] p-5">
        <p className="text-sm font-bold mb-4">Recent Transactions</p>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 bg-[var(--pt-muted-strong)] rounded-lg animate-pulse" />
            ))}
          </div>
        ) : !data?.recentTransactions.length ? (
          <p className="text-sm text-[var(--pt-text-tertiary)] text-center py-8">No transactions yet today</p>
        ) : (
          <div className="divide-y divide-[var(--pt-border)]">
            {data.recentTransactions.map((t) => (
              <div key={t.id} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <span className="text-lg">{PAYMENT_ICON[t.payment_method] ?? "💳"}</span>
                  <div>
                    <p className="text-[13px] font-semibold font-mono">{t.receipt_number}</p>
                    <p className="text-[11px] text-[var(--pt-text-tertiary)]">
                      {t.customer_name ?? "Walk-in"} · {timeStr(t.created_at)}
                    </p>
                  </div>
                </div>
                <span className="text-sm font-bold tabular-nums">{formatKES(t.total_amount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
