"use client"

import { AlertTriangle, CheckCircle2, CircleDashed, Clock, Moon, Sprout, TrendingDown, TrendingUp, Minus } from "lucide-react"
import type { HealthLevel } from "@/lib/insights/health"

// Building blocks for the operator console's insights (list + pharmacy page).

export const kes = (n: number) => `KES ${Math.round(n).toLocaleString("en-KE")}`

/** KES 1.2M / KES 845K / KES 9,200 — for tiles and tables where space is tight. */
export function kesShort(n: number): string {
  const a = Math.abs(n)
  if (a >= 1_000_000) return `KES ${(n / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1)}M`
  if (a >= 10_000) return `KES ${Math.round(n / 1000)}K`
  return kes(n)
}

export function ago(ms: number | null | undefined, now = Date.now()): string {
  if (ms == null) return "Never"
  const m = Math.floor((now - ms) / 60_000)
  if (m < 2) return "Just now"
  if (m < 60) return `${m} min ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.floor(h / 24)
  if (d === 1) return "Yesterday"
  if (d < 30) return `${d} days ago`
  const mo = Math.floor(d / 30)
  return `${mo} month${mo === 1 ? "" : "s"} ago`
}

export const shortDate = (ms: number | null | undefined) =>
  ms == null ? "—" : new Date(ms).toLocaleDateString("en-KE", { timeZone: "Africa/Nairobi", day: "numeric", month: "short", year: "numeric" })

/** % change vs the previous period; null when there's nothing to compare with. */
export function change(cur: number, prev: number): number | null {
  if (prev <= 0) return cur > 0 ? null : 0
  return (cur - prev) / prev
}

// Status colours are reserved for health and always come with an icon + label.
const HEALTH_STYLE: Record<HealthLevel, { cls: string; icon: React.ComponentType<{ size?: number }> }> = {
  healthy: { cls: "bg-[var(--pt-green-50)] text-[var(--pt-green-600)] border-[var(--pt-green-100)]", icon: CheckCircle2 },
  new: { cls: "bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-500/30", icon: Sprout },
  slipping: { cls: "bg-amber-50 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-500/30", icon: Clock },
  at_risk: { cls: "bg-orange-50 dark:bg-orange-500/15 text-orange-800 dark:text-orange-300 border-orange-200 dark:border-orange-500/30", icon: AlertTriangle },
  never_started: { cls: "bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 border-red-200 dark:border-red-500/30", icon: CircleDashed },
  inactive: { cls: "bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 border-red-200 dark:border-red-500/30", icon: Moon },
}

export function HealthBadge({ level, label, size = "sm" }: { level: HealthLevel; label: string; size?: "sm" | "md" }) {
  const { cls, icon: Icon } = HEALTH_STYLE[level]
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border font-semibold whitespace-nowrap ${cls} ${size === "md" ? "px-2.5 py-1 text-xs" : "px-2 py-0.5 text-[11px]"}`}>
      <Icon size={size === "md" ? 13 : 11} /> {label}
    </span>
  )
}

export function Delta({ value, invert = false, label = "vs previous 30 days" }: { value: number | null; invert?: boolean; label?: string }) {
  // Nothing earlier to compare with (e.g. a pharmacy's first month): say nothing.
  if (value == null) return null
  const pct = Math.round(value * 100)
  const up = pct > 0
  const good = invert ? !up : up
  const Icon = pct === 0 ? Minus : up ? TrendingUp : TrendingDown
  const tone = pct === 0 ? "text-[var(--pt-text-tertiary)]" : good ? "text-[var(--pt-green-600)]" : "text-[var(--pt-red)]"
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${tone}`} title={label}>
      <Icon size={12} /> {pct > 0 ? "+" : ""}{pct}%
    </span>
  )
}

export function Card({ title, action, children, className = "" }: { title?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-2 px-5 pt-4 pb-2">
          {title && <h2 className="text-[13px] font-semibold text-[var(--pt-text-secondary)]">{title}</h2>}
          {action}
        </div>
      )}
      <div className={title || action ? "px-5 pb-5" : "p-5"}>{children}</div>
    </section>
  )
}

export function Kpi({ label, value, sub, delta, invert, onClick, active }: {
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
  delta?: number | null
  invert?: boolean
  onClick?: () => void
  active?: boolean
}) {
  const body = (
    <>
      <p className="text-[12px] font-medium text-[var(--pt-text-secondary)]">{label}</p>
      <p className="text-xl font-bold tabular-nums mt-1 tracking-tight">{value}</p>
      <div className="flex items-center gap-2 mt-1 min-h-4 text-[11px] text-[var(--pt-text-tertiary)]">
        {delta !== undefined && <Delta value={delta} invert={invert} />}
        {sub && <span className="truncate">{sub}</span>}
      </div>
    </>
  )
  const cls = `text-left bg-[var(--pt-surface)] rounded-xl border px-4 py-3.5 transition-colors ${active ? "border-[var(--pt-green)] ring-1 ring-[var(--pt-green)]" : "border-[var(--pt-border)]"}`
  return onClick
    ? <button type="button" onClick={onClick} className={`${cls} hover:border-[var(--pt-border-strong)]`}>{body}</button>
    : <div className={cls}>{body}</div>
}

/** 30-day sales trend in a table row — one series, the title carries the total. */
export function Sparkline({ values, width = 96, height = 26 }: { values: number[]; width?: number; height?: number }) {
  const max = Math.max(...values, 0)
  const total = values.reduce((s, v) => s + v, 0)
  if (max <= 0) {
    return <svg width={width} height={height} role="img" aria-label="No sales in the last 30 days"><line x1="0" y1={height - 1} x2={width} y2={height - 1} stroke="var(--pt-border-strong)" strokeWidth="1.5" strokeDasharray="2 3" /></svg>
  }
  const step = width / Math.max(1, values.length - 1)
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(height - 2 - (v / max) * (height - 4)).toFixed(1)}`)
  return (
    <svg width={width} height={height} role="img" aria-label={`Sales over 30 days: ${kes(total)}`}>
      <title>{`Last 30 days: ${kes(total)}`}</title>
      <polygon points={`0,${height} ${pts.join(" ")} ${width},${height}`} fill="var(--pt-viz-sales)" opacity="0.12" />
      <polyline points={pts.join(" ")} fill="none" stroke="var(--pt-viz-sales)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-[var(--pt-text-tertiary)] py-6 text-center">{children}</p>
}
