"use client"

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { kes, kesShort } from "./ui"

// Charts for the operator console. Colours: --pt-viz-sales / --pt-viz-profit
// (validated pair, light + dark). Single-hue opacity steps for magnitude
// (active days, busy hours). One y-axis per chart, always.

const dayLabel = (d: string) => new Date(`${d}T12:00:00+03:00`).toLocaleDateString("en-KE", { day: "numeric", month: "short" })
const weekday = (d: string) => new Date(`${d}T12:00:00+03:00`).toLocaleDateString("en-KE", { weekday: "short", day: "numeric", month: "short" })

/* eslint-disable @typescript-eslint/no-explicit-any */
function Tip({ active, payload, label, money = true }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-[var(--pt-border)] bg-[var(--pt-surface)] px-3 py-2 shadow-sm text-xs">
      <p className="font-semibold mb-1">{weekday(String(label))}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="flex items-center gap-1.5 text-[var(--pt-text-secondary)]">
          <span className="w-2 h-2 rounded-sm" style={{ background: p.color }} />
          {p.name}: <span className="font-semibold text-[var(--pt-text)] tabular-nums">{money ? kes(Number(p.value)) : Number(p.value).toLocaleString("en-KE")}</span>
        </p>
      ))}
    </div>
  )
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const axis = { stroke: "var(--pt-text-tertiary)", fontSize: 11, tickLine: false, axisLine: false } as const

/** One series per day (bars) — platform sales trend, active pharmacies. */
export function DailyBars({ data, dataKey, name, money = true, color = "var(--pt-viz-sales)", height = 180 }: {
  data: Array<Record<string, number | string>>
  dataKey: string
  name: string
  money?: boolean
  color?: string
  height?: number
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} barCategoryGap={2} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--pt-border)" strokeDasharray="3 3" />
        <XAxis dataKey="day" tickFormatter={dayLabel} interval="preserveStartEnd" minTickGap={28} {...axis} />
        <YAxis width={money ? 64 : 28} tickFormatter={(v: number) => (money ? kesShort(v).replace("KES ", "") : String(v))} allowDecimals={!money ? false : undefined} {...axis} />
        <Tooltip content={<Tip money={money} />} cursor={{ fill: "var(--pt-muted-strong)" }} />
        <Bar dataKey={dataKey} name={name} fill={color} radius={[3, 3, 0, 0]} maxBarSize={18} />
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Sales and profit per day, same unit (KES) on one axis. */
export function SalesProfitChart({ data, height = 240 }: { data: Array<{ day: string; revenue: number; profit: number }>; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="vizSales" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--pt-viz-sales)" stopOpacity={0.22} />
            <stop offset="100%" stopColor="var(--pt-viz-sales)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--pt-border)" strokeDasharray="3 3" />
        <XAxis dataKey="day" tickFormatter={dayLabel} interval="preserveStartEnd" minTickGap={32} {...axis} />
        <YAxis width={64} tickFormatter={(v: number) => kesShort(v).replace("KES ", "")} {...axis} />
        <Tooltip content={<Tip />} cursor={{ stroke: "var(--pt-border-strong)" }} />
        <Legend verticalAlign="top" align="right" height={24} iconType="plainline" wrapperStyle={{ fontSize: 12, color: "var(--pt-text-secondary)" }} />
        <Area type="monotone" dataKey="revenue" name="Sales" stroke="var(--pt-viz-sales)" strokeWidth={2} fill="url(#vizSales)" activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--pt-surface)" }} />
        <Area type="monotone" dataKey="profit" name="Profit" stroke="var(--pt-viz-profit)" strokeWidth={2} fill="none" activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--pt-surface)" }} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

/** Active days, GitHub-style: one square per day, darker = more sales. */
export function ActivityCalendar({ days }: { days: Array<{ day: string; activeStaff: number; sales: number }> }) {
  // Columns are weeks (Mon→Sun rows); pad the first week so rows line up with weekdays.
  const first = new Date(`${days[0]?.day ?? "2026-01-01"}T12:00:00+03:00`)
  const lead = (first.getUTCDay() + 6) % 7
  const cells: Array<(typeof days)[number] | null> = [...Array(lead).fill(null), ...days]
  const weeks: Array<typeof cells> = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  const max = Math.max(1, ...days.map((d) => d.sales))
  const level = (d: (typeof days)[number]) => {
    if (d.sales === 0 && d.activeStaff === 0) return 0
    const r = d.sales / max
    return d.sales === 0 ? 0.18 : r > 0.66 ? 1 : r > 0.33 ? 0.7 : 0.42
  }
  return (
    <div>
      <div className="flex gap-[3px] overflow-x-auto pb-1" role="img" aria-label="Days PharmaTrack was used">
        <div className="flex flex-col gap-[3px] pr-1 text-[10px] text-[var(--pt-text-tertiary)] leading-[13px]">
          {["Mon", "", "Wed", "", "Fri", "", "Sun"].map((d, i) => <span key={i} className="h-[13px]">{d}</span>)}
        </div>
        {weeks.map((w, wi) => (
          <div key={wi} className="flex flex-col gap-[3px]">
            {w.map((d, di) => d == null ? <span key={di} className="w-[13px] h-[13px]" /> : (
              <span
                key={di}
                title={`${weekday(d.day)} — ${d.sales} sale${d.sales === 1 ? "" : "s"}, ${d.activeStaff} staff active`}
                className="w-[13px] h-[13px] rounded-[3px] border border-[var(--pt-border)]"
                style={level(d) > 0 ? { background: "var(--pt-viz-sales)", opacity: level(d), borderColor: "transparent" } : undefined}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1.5 mt-2 text-[11px] text-[var(--pt-text-tertiary)]">
        Less
        {[0, 0.18, 0.42, 0.7, 1].map((o) => (
          <span key={o} className="w-[11px] h-[11px] rounded-[3px] border border-[var(--pt-border)]" style={o > 0 ? { background: "var(--pt-viz-sales)", opacity: o, borderColor: "transparent" } : undefined} />
        ))}
        More · faint = signed in, no sale
      </div>
    </div>
  )
}

/** When they sell: weekday × hour (06:00–22:00), darker = more sales. */
export function BusyHours({ cells }: { cells: Array<{ dow: number; hour: number; sales: number }> }) {
  const hours = Array.from({ length: 17 }, (_, i) => i + 6)
  const map = new Map(cells.map((c) => [`${c.dow}:${c.hour}`, c.sales]))
  const max = Math.max(1, ...cells.map((c) => c.sales))
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-[3px] text-[10px] text-[var(--pt-text-tertiary)]" aria-label="Sales by weekday and hour">
        <thead>
          <tr><th />{hours.map((h) => <th key={h} className="font-normal w-[18px]">{h % 3 === 0 ? `${h}` : ""}</th>)}</tr>
        </thead>
        <tbody>
          {days.map((d, i) => (
            <tr key={d}>
              <th className="font-normal pr-1 text-left">{d}</th>
              {hours.map((h) => {
                const n = map.get(`${i + 1}:${h}`) ?? 0
                return (
                  <td key={h} title={`${d} ${String(h).padStart(2, "0")}:00 — ${n} sale${n === 1 ? "" : "s"}`}
                    className="w-[18px] h-[16px] rounded-[3px] border border-[var(--pt-border)]"
                    style={n > 0 ? { background: "var(--pt-viz-sales)", opacity: 0.25 + 0.75 * (n / max), borderColor: "transparent" } : undefined} />
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Reference categorical slots 1–3 (blue, orange, aqua) — validated as a set.
const MIX_COLOR: Record<string, string> = { cash: "#2a78d6", split: "#eb6834", mpesa: "#1baf7a" }
const MIX_LABEL: Record<string, string> = { cash: "Cash", mpesa: "M-Pesa", split: "Split" }

/** How customers pay: one 100% bar + a labelled legend (identity never colour-only). */
export function PaymentMix({ mix }: { mix: Array<{ method: string; sales: number; revenue: number }> }) {
  const total = mix.reduce((s, m) => s + m.revenue, 0)
  if (total <= 0) return <p className="text-sm text-[var(--pt-text-tertiary)]">No sales in the last 30 days.</p>
  const order = ["cash", "split", "mpesa"].map((k) => mix.find((m) => m.method === k)).filter((m): m is NonNullable<typeof m> => !!m)
  return (
    <div>
      <div className="flex h-3 rounded-full overflow-hidden gap-[2px] bg-[var(--pt-surface)]">
        {order.map((m) => <span key={m.method} title={`${MIX_LABEL[m.method]}: ${kes(m.revenue)}`} style={{ width: `${(m.revenue / total) * 100}%`, background: MIX_COLOR[m.method] }} />)}
      </div>
      <ul className="mt-3 space-y-1.5">
        {order.map((m) => (
          <li key={m.method} className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: MIX_COLOR[m.method] }} />{MIX_LABEL[m.method] ?? m.method}</span>
            <span className="tabular-nums text-[var(--pt-text-secondary)]"><span className="font-semibold text-[var(--pt-text)]">{Math.round((m.revenue / total) * 100)}%</span> · {kes(m.revenue)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
