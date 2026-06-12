"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  LineChart, Line,
} from "recharts"
import {
  TrendingUp, Package, DollarSign, Download, RefreshCw,
  ShoppingBag, AlertTriangle, Clock, Users, Wallet,
} from "lucide-react"
import { formatKES } from "@/lib/store/cartStore"
import { useSessionStore } from "@/lib/store/sessionStore"

// ─── Types ───────────────────────────────────────────────────────────────────

interface SalesReport {
  summary: {
    totalRevenue: number
    totalCash: number
    totalMpesa: number
    totalSplit: number
    totalDiscount: number
    transactionCount: number
    totalCost: number
    totalProfit: number
  }
  dailyChart: Array<{ date: string; revenue: number; cash: number; mpesa: number; count: number }>
  byCashier: Array<{ name: string; revenue: number; count: number }>
  topProducts: Array<{ name: string; qty: number; revenue: number; cost: number; profit: number; margin: number | null }>
  transactions: Array<{
    id: string; receipt_number: string; created_at: string
    payment_method: string; total_amount: number; discount_amount: number
    cashier: string; branch: string; item_count: number
  }>
}

interface InventoryReport {
  summary: { totalSKUs: number; outOfStock: number; lowStock: number; expiring: number; controlled: number }
  items: Array<{
    product_id: string; name: string; brand_name: string | null; strength: string | null
    dosage_form: string | null; stock_on_hand: number | null; reorder_level: number | null
    earliest_expiry: string | null; expiry_days: number | null; is_controlled: boolean | null
    selling_price: number | null; cost_price: number | null; status: string; base_unit: string | null
  }>
}

interface FinancialReport {
  summary: { totalRevenue: number; totalDiscounts: number; transactions: number; avgOrderValue: number; totalProfit: number }
  monthlyChart: Array<{ month: string; revenue: number; discounts: number; count: number; profit: number }>
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function exportCSV(rows: Record<string, unknown>[], filename: string) {
  if (!rows.length) return
  const headers = Object.keys(rows[0] ?? {})
  const csv = [
    headers.join(","),
    ...rows.map(r => headers.map(h => JSON.stringify(r[h] ?? "")).join(","))
  ].join("\n")
  const blob = new Blob([csv], { type: "text/csv" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

function KpiCard({ icon: Icon, label, value, sub, color = "green" }: {
  icon: React.ComponentType<{ size?: number; className?: string }>
  label: string; value: string; sub?: string
  color?: "green" | "amber" | "red" | "blue"
}) {
  const colors = {
    green: "bg-[var(--pt-green-50)] text-[var(--pt-green-600)]",
    amber: "bg-amber-50 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400",
    red: "bg-red-50 dark:bg-red-500/15 text-red-600 dark:text-red-400",
    blue: "bg-blue-50 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400",
  }
  return (
    <div className="bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] p-5 flex items-start gap-4">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${colors[color]}`}>
        <Icon size={18} />
      </div>
      <div>
        <p className="text-[12px] text-[var(--pt-text-secondary)] font-medium uppercase tracking-wide">{label}</p>
        <p className="text-[22px] font-bold tabular-nums mt-0.5">{value}</p>
        {sub && <p className="text-[12px] text-[var(--pt-text-tertiary)] mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[var(--pt-surface)] border border-[var(--pt-border)] rounded-lg p-3 shadow-lg text-[12px]">
      <p className="font-semibold text-[var(--pt-text)] mb-1">{label}</p>
      {payload.map(p => (
        <div key={p.name} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-[var(--pt-text-secondary)] capitalize">{p.name}:</span>
          <span className="font-semibold tabular-nums">{formatKES(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Sales tab ───────────────────────────────────────────────────────────────

function SalesTab({ from, to, branchId }: { from: string; to: string; branchId: string }) {
  const params = new URLSearchParams({ report: "sales", from, to })
  if (branchId) params.set("branch_id", branchId)

  const { data, isLoading, refetch } = useQuery<SalesReport>({
    queryKey: ["reports-sales", from, to, branchId],
    queryFn: async () => {
      const res = await fetch(`/api/reports?${params}`)
      if (!res.ok) throw new Error("Failed to load report")
      return res.json() as Promise<SalesReport>
    },
    staleTime: 2 * 60_000,
  })

  if (isLoading) return <ReportSkeleton />
  if (!data) return null

  const { summary, dailyChart, byCashier, topProducts, transactions } = data
  const maxRevenue = Math.max(...(topProducts.map(p => p.revenue)), 1)

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard icon={TrendingUp} label="Total Revenue" value={formatKES(summary.totalRevenue)} sub={`${summary.transactionCount} transactions`} />
        <KpiCard
          icon={Wallet}
          label="Gross Profit"
          value={formatKES(summary.totalProfit)}
          sub={summary.totalRevenue > 0 ? `${((summary.totalProfit / summary.totalRevenue) * 100).toFixed(1)}% margin` : undefined}
        />
        <KpiCard icon={DollarSign} label="Cash" value={formatKES(summary.totalCash)} color="blue" />
        <KpiCard icon={ShoppingBag} label="M-Pesa" value={formatKES(summary.totalMpesa)} color="green" />
        <KpiCard icon={AlertTriangle} label="Discounts Given" value={formatKES(summary.totalDiscount)} color="amber" />
      </div>

      {/* Daily chart */}
      {dailyChart.length > 0 && (
        <div className="bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[14px] font-bold">Daily Revenue</h3>
            <button onClick={() => refetch()} className="text-[var(--pt-text-tertiary)] hover:text-[var(--pt-text)] transition-colors">
              <RefreshCw size={14} />
            </button>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dailyChart} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={d => d.slice(5)} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="cash" name="Cash" fill="#60a5fa" radius={[3, 3, 0, 0]} stackId="a" />
              <Bar dataKey="mpesa" name="M-Pesa" fill="#22c55e" radius={[3, 3, 0, 0]} stackId="a" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top products */}
        <div className="bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[14px] font-bold">Top Products by Revenue</h3>
            <button
              onClick={() => exportCSV(topProducts as unknown as Record<string, unknown>[], `top-products-${from}-${to}.csv`)}
              className="flex items-center gap-1.5 text-[12px] text-[var(--pt-text-secondary)] hover:text-[var(--pt-text)] transition-colors"
            >
              <Download size={13} /> CSV
            </button>
          </div>
          <div className="space-y-3">
            {topProducts.map((p, i) => (
              <div key={p.name}>
                <div className="flex items-center justify-between text-[13px] mb-1">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="w-5 h-5 rounded-full bg-[var(--pt-muted-strong)] text-[10px] font-bold flex items-center justify-center shrink-0 text-[var(--pt-text-secondary)]">{i + 1}</span>
                    <span className="truncate font-medium">{p.name}</span>
                  </span>
                  <span className="tabular-nums font-semibold shrink-0 ml-2">{formatKES(p.revenue)}</span>
                </div>
                <div className="h-1.5 bg-[var(--pt-muted-strong)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[var(--pt-green)] rounded-full"
                    style={{ width: `${(p.revenue / maxRevenue) * 100}%` }}
                  />
                </div>
                <p className="text-[11px] text-[var(--pt-text-tertiary)] mt-0.5 flex items-center justify-between gap-2">
                  <span>{p.qty} units sold</span>
                  <span className={p.profit >= 0 ? "text-[var(--pt-green-600)] font-medium" : "text-[var(--pt-red)] font-medium"}>
                    {formatKES(p.profit)} profit
                    {p.margin !== null && <span className="text-[var(--pt-text-tertiary)] font-normal"> · {(p.margin * 100).toFixed(0)}%</span>}
                  </span>
                </p>
              </div>
            ))}
            {topProducts.length === 0 && <p className="text-[13px] text-[var(--pt-text-tertiary)]">No sales in range</p>}
          </div>
        </div>

        {/* By cashier */}
        <div className="bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] p-5">
          <h3 className="text-[14px] font-bold mb-4">Sales by Cashier</h3>
          <div className="space-y-2">
            {byCashier.map(c => (
              <div key={c.name} className="flex items-center justify-between py-2 border-b border-[var(--pt-border)] last:border-b-0 text-[13px]">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-[var(--pt-green-50)] text-[var(--pt-green-600)] text-[10px] font-bold flex items-center justify-center">
                    {c.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()}
                  </div>
                  <span className="font-medium">{c.name}</span>
                </div>
                <div className="text-right">
                  <p className="font-semibold tabular-nums">{formatKES(c.revenue)}</p>
                  <p className="text-[11px] text-[var(--pt-text-tertiary)]">{c.count} sales</p>
                </div>
              </div>
            ))}
            {byCashier.length === 0 && <p className="text-[13px] text-[var(--pt-text-tertiary)]">No data</p>}
          </div>
        </div>
      </div>

      {/* Transactions table */}
      <div className="bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[14px] font-bold">Transactions <span className="font-normal text-[var(--pt-text-tertiary)] text-[12px]">(latest 100)</span></h3>
          <button
            onClick={() => exportCSV(transactions as unknown as Record<string, unknown>[], `transactions-${from}-${to}.csv`)}
            className="flex items-center gap-1.5 text-[12px] text-[var(--pt-text-secondary)] hover:text-[var(--pt-text)] transition-colors"
          >
            <Download size={13} /> CSV
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--pt-border)]">
                {["Receipt", "Date", "Cashier", "Payment", "Items", "Discount", "Total"].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-[11px] font-bold text-[var(--pt-text-secondary)] uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {transactions.map(t => (
                <tr key={t.id} className="border-b border-[var(--pt-border)] last:border-b-0 hover:bg-[var(--pt-muted)]/60">
                  <td className="px-3 py-2.5 font-mono text-[12px]">{t.receipt_number}</td>
                  <td className="px-3 py-2.5 text-[12px] whitespace-nowrap text-[var(--pt-text-secondary)]">
                    {new Date(t.created_at).toLocaleDateString("en-KE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" })}
                  </td>
                  <td className="px-3 py-2.5 text-[12px]">{t.cashier}</td>
                  <td className="px-3 py-2.5">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                      t.payment_method === "mpesa" ? "bg-green-50 text-green-700 dark:text-green-300"
                        : t.payment_method === "cash" ? "bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300"
                        : "bg-purple-50 text-purple-700"
                    }`}>
                      {t.payment_method.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-center text-[12px]">{t.item_count}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-[12px] text-amber-700 dark:text-amber-300">{t.discount_amount > 0 ? formatKES(t.discount_amount) : "—"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-[13px]">{formatKES(t.total_amount)}</td>
                </tr>
              ))}
              {transactions.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-[var(--pt-text-tertiary)] text-[13px]">No transactions in range</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Inventory tab ───────────────────────────────────────────────────────────

function InventoryTab({ branchId }: { branchId: string }) {
  const [filter, setFilter] = useState<"all" | "out_of_stock" | "low_stock" | "expiring" | "controlled">("all")

  const params = new URLSearchParams({ report: "inventory" })
  if (branchId) params.set("branch_id", branchId)

  const { data, isLoading } = useQuery<InventoryReport>({
    queryKey: ["reports-inventory", branchId],
    queryFn: async () => {
      const res = await fetch(`/api/reports?${params}`)
      if (!res.ok) throw new Error("Failed")
      return res.json() as Promise<InventoryReport>
    },
    staleTime: 2 * 60_000,
  })

  if (isLoading) return <ReportSkeleton />
  if (!data) return null

  const { summary, items } = data
  const filtered = filter === "all" ? items : items.filter(i => {
    if (filter === "controlled") return i.is_controlled
    return i.status === filter
  })

  const STATUS_CHIP = {
    all:          { label: "All",         count: summary.totalSKUs, className: "bg-[var(--pt-muted-strong)] text-[var(--pt-text)]" },
    out_of_stock: { label: "Out of stock", count: summary.outOfStock, className: "bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 border border-red-200" },
    low_stock:    { label: "Low stock",   count: summary.lowStock,  className: "bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-200" },
    expiring:     { label: "Expiring",    count: summary.expiring,  className: "bg-yellow-50 dark:bg-yellow-500/15 text-yellow-700 dark:text-yellow-300 border border-yellow-200" },
    controlled:   { label: "Controlled",  count: summary.controlled, className: "bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-200" },
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard icon={Package} label="Total SKUs" value={String(summary.totalSKUs)} />
        <KpiCard icon={AlertTriangle} label="Out of Stock" value={String(summary.outOfStock)} color="red" />
        <KpiCard icon={TrendingUp} label="Low Stock" value={String(summary.lowStock)} color="amber" />
        <KpiCard icon={Clock} label="Expiring ≤90d" value={String(summary.expiring)} color="amber" />
        <KpiCard icon={Users} label="Controlled" value={String(summary.controlled)} color="blue" />
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        {(Object.entries(STATUS_CHIP) as Array<[typeof filter, typeof STATUS_CHIP[keyof typeof STATUS_CHIP]]>).map(([key, cfg]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-3 py-1.5 rounded-full text-[12px] font-semibold transition-colors ${
              filter === key ? cfg.className : "bg-[var(--pt-muted-strong)] text-[var(--pt-text-secondary)] hover:bg-[var(--pt-border)]"
            }`}
          >
            {cfg.label} <span className="opacity-70">({cfg.count})</span>
          </button>
        ))}
      </div>

      <div className="bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--pt-border)] bg-[var(--pt-muted)]">
          <span className="text-[12px] font-bold text-[var(--pt-text-secondary)] uppercase tracking-wider">
            {filtered.length} items
          </span>
          <button
            onClick={() => exportCSV(filtered as unknown as Record<string, unknown>[], `inventory-report.csv`)}
            className="flex items-center gap-1.5 text-[12px] text-[var(--pt-text-secondary)] hover:text-[var(--pt-text)] transition-colors"
          >
            <Download size={13} /> Export CSV
          </button>
        </div>
        <div className="overflow-x-auto max-h-[460px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[var(--pt-surface)] border-b border-[var(--pt-border)]">
              <tr>
                {["Product", "Strength", "Form", "Stock", "Reorder", "Expiry", "Status"].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-[11px] font-bold text-[var(--pt-text-secondary)] uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.product_id} className="border-b border-[var(--pt-border)] last:border-b-0 hover:bg-[var(--pt-muted)]/60">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-[13px]">{p.name}</p>
                    {p.brand_name && <p className="text-[11px] text-[var(--pt-text-tertiary)]">{p.brand_name}</p>}
                  </td>
                  <td className="px-4 py-3 text-[var(--pt-text-secondary)] text-[13px]">{p.strength ?? "—"}</td>
                  <td className="px-4 py-3 text-[var(--pt-text-secondary)] text-[13px]">{p.dosage_form ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-bold tabular-nums text-[13px]">
                    <span className={
                      (p.stock_on_hand ?? 0) === 0 ? "text-[var(--pt-red)]"
                        : (p.stock_on_hand ?? 0) <= (p.reorder_level ?? 10) ? "text-amber-600 dark:text-amber-400"
                        : "text-[var(--pt-text)]"
                    }>
                      {p.stock_on_hand ?? 0}
                    </span>
                    <span className="text-[11px] text-[var(--pt-text-tertiary)] ml-1">{p.base_unit}</span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-[13px] text-[var(--pt-text-secondary)]">{p.reorder_level ?? 10}</td>
                  <td className="px-4 py-3 text-[13px]">
                    {p.earliest_expiry ? (
                      <div>
                        <p>{new Date(p.earliest_expiry).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}</p>
                        {p.expiry_days !== null && p.expiry_days <= 90 && (
                          <p className={`text-[11px] font-medium ${p.expiry_days <= 30 ? "text-[var(--pt-red)]" : "text-amber-600 dark:text-amber-400"}`}>
                            {p.expiry_days < 0 ? "EXPIRED" : `in ${p.expiry_days}d`}
                          </p>
                        )}
                      </div>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                      p.status === "out_of_stock" ? "bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 border-red-100"
                        : p.status === "low_stock" ? "bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-100"
                        : p.status === "expiring" ? "bg-yellow-50 dark:bg-yellow-500/15 text-yellow-700 dark:text-yellow-300 border-yellow-100"
                        : "bg-[var(--pt-green-50)] text-[var(--pt-green-600)] border-[var(--pt-green-100)]"
                    }`}>
                      {p.status.replace("_", " ")}
                    </span>
                    {p.is_controlled && (
                      <span className="ml-1 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-100">
                        controlled
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-[var(--pt-text-tertiary)] text-[13px]">No items match</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Financial tab ───────────────────────────────────────────────────────────

function FinancialTab({ from, to, branchId }: { from: string; to: string; branchId: string }) {
  const params = new URLSearchParams({ report: "financial", from, to })
  if (branchId) params.set("branch_id", branchId)

  const { data, isLoading } = useQuery<FinancialReport>({
    queryKey: ["reports-financial", from, to, branchId],
    queryFn: async () => {
      const res = await fetch(`/api/reports?${params}`)
      if (!res.ok) throw new Error("Failed")
      return res.json() as Promise<FinancialReport>
    },
    staleTime: 2 * 60_000,
  })

  if (isLoading) return <ReportSkeleton />
  if (!data) return null

  const { summary, monthlyChart } = data

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard icon={TrendingUp} label="Total Revenue" value={formatKES(summary.totalRevenue)} sub={`${summary.transactions} transactions`} />
        <KpiCard
          icon={Wallet}
          label="Gross Profit"
          value={formatKES(summary.totalProfit)}
          sub={summary.totalRevenue > 0 ? `${((summary.totalProfit / summary.totalRevenue) * 100).toFixed(1)}% margin` : undefined}
        />
        <KpiCard icon={DollarSign} label="Avg. Order Value" value={formatKES(summary.avgOrderValue)} />
        <KpiCard icon={AlertTriangle} label="Total Discounts" value={formatKES(summary.totalDiscounts)} color="amber" />
        <KpiCard icon={ShoppingBag} label="Net Revenue" value={formatKES(summary.totalRevenue - summary.totalDiscounts)} color="blue" />
      </div>

      {monthlyChart.length > 0 && (
        <div className="bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] p-5">
          <h3 className="text-[14px] font-bold mb-4">Monthly Revenue Trend</h3>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={monthlyChart}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#22c55e" strokeWidth={2.5} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="profit" name="Gross Profit" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="discounts" name="Discounts" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} strokeDasharray="4 2" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {monthlyChart.length > 0 && (
        <div className="bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--pt-border)] bg-[var(--pt-muted)]">
            <h3 className="text-[14px] font-bold">Monthly Breakdown</h3>
            <button
              onClick={() => exportCSV(monthlyChart as unknown as Record<string, unknown>[], `financial-${from}-${to}.csv`)}
              className="flex items-center gap-1.5 text-[12px] text-[var(--pt-text-secondary)] hover:text-[var(--pt-text)] transition-colors"
            >
              <Download size={13} /> CSV
            </button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--pt-border)]">
                {["Month", "Transactions", "Revenue", "Discounts", "Gross Profit", "Net Revenue"].map(h => (
                  <th key={h} className="px-5 py-2.5 text-left text-[11px] font-bold text-[var(--pt-text-secondary)] uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...monthlyChart].reverse().map(m => (
                <tr key={m.month} className="border-b border-[var(--pt-border)] last:border-b-0 hover:bg-[var(--pt-muted)]/60">
                  <td className="px-5 py-3 font-medium text-[13px]">
                    {new Date(m.month + "-01").toLocaleDateString("en-KE", { month: "long", year: "numeric" })}
                  </td>
                  <td className="px-5 py-3 text-center tabular-nums text-[13px]">{m.count}</td>
                  <td className="px-5 py-3 text-right tabular-nums font-semibold text-[13px]">{formatKES(m.revenue)}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-amber-700 dark:text-amber-300 text-[13px]">{formatKES(m.discounts)}</td>
                  <td className="px-5 py-3 text-right tabular-nums font-semibold text-[13px] text-blue-600 dark:text-blue-400">{formatKES(m.profit)}</td>
                  <td className="px-5 py-3 text-right tabular-nums font-semibold text-[13px] text-[var(--pt-green-600)]">{formatKES(m.revenue - m.discounts)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {monthlyChart.length === 0 && (
        <div className="bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] flex items-center justify-center py-16 text-[var(--pt-text-tertiary)] text-[13px]">
          No financial data in selected range
        </div>
      )}
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function ReportSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] p-5 h-24" />
        ))}
      </div>
      <div className="bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] h-64" />
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = "sales" | "inventory" | "financial"

const TABS: Array<{ id: Tab; label: string; icon: React.ComponentType<{ size?: number }> }> = [
  { id: "sales", label: "Sales", icon: TrendingUp },
  { id: "inventory", label: "Inventory", icon: Package },
  { id: "financial", label: "Financial", icon: DollarSign },
]

function defaultDateRange() {
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - 29)
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  }
}

export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>("sales")
  const { from: defaultFrom, to: defaultTo } = defaultDateRange()
  const [from, setFrom] = useState(defaultFrom)
  const [to, setTo] = useState(defaultTo)
  const [branchId, setBranchId] = useState("")
  const branches = useSessionStore(s => s.branches)

  return (
    <div className="flex flex-col h-full bg-[var(--pt-bg)]">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-[var(--pt-surface)] border-b border-[var(--pt-border)] shrink-0 flex-wrap gap-3">
        <div>
          <h1 className="text-[17px] font-bold text-[var(--pt-text)]">Reports</h1>
          <p className="text-[13px] text-[var(--pt-text-secondary)] mt-0.5">Analytics and performance data</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {branches && branches.length > 1 && (
            <select
              value={branchId}
              onChange={e => setBranchId(e.target.value)}
              className="h-9 text-sm rounded-lg border border-[var(--pt-border)] px-3 bg-[var(--pt-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--pt-green)]"
            >
              <option value="">All branches</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
          <input
            type="date"
            value={from}
            onChange={e => setFrom(e.target.value)}
            className="h-9 text-sm rounded-lg border border-[var(--pt-border)] px-3 bg-[var(--pt-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--pt-green)]"
          />
          <span className="text-[var(--pt-text-tertiary)] text-sm">to</span>
          <input
            type="date"
            value={to}
            onChange={e => setTo(e.target.value)}
            className="h-9 text-sm rounded-lg border border-[var(--pt-border)] px-3 bg-[var(--pt-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--pt-green)]"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-6 pt-4 pb-0 bg-[var(--pt-bg)] border-b border-[var(--pt-border)] shrink-0">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={[
              "flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors -mb-px",
              tab === t.id
                ? "border-[var(--pt-green-600)] text-[var(--pt-green-600)]"
                : "border-transparent text-[var(--pt-text-secondary)] hover:text-[var(--pt-text)]",
            ].join(" ")}
          >
            <t.icon size={15} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-6 py-6">
        {tab === "sales"     && <SalesTab from={from} to={to} branchId={branchId} />}
        {tab === "inventory" && <InventoryTab branchId={branchId} />}
        {tab === "financial" && <FinancialTab from={from} to={to} branchId={branchId} />}
      </div>
    </div>
  )
}
