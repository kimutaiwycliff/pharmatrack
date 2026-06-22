"use client"

import { useState, useMemo } from "react"
import { TrendingUp } from "lucide-react"

const fmt = (n: number) => "KES " + Math.round(n).toLocaleString("en-KE")

export function RoiCalculator() {
  const [stockValue, setStockValue] = useState(400_000) // monthly inventory value
  const [wastePct, setWastePct] = useState(4) // % lost to expiry
  const [staff, setStaff] = useState(3)

  const { expirySaved, timeSaved, total } = useMemo(() => {
    // Conservative model: recover ~70% of expiry waste; ~6 hrs/week/staff at KES 250/hr.
    const expirySaved = stockValue * (wastePct / 100) * 0.7
    const timeSaved = staff * 6 * 4.3 * 250
    return { expirySaved, timeSaved, total: expirySaved + timeSaved }
  }, [stockValue, wastePct, staff])

  return (
    <section className="mx-auto max-w-6xl px-5 py-20 md:py-28">
      <div className="rounded-3xl border border-[var(--pt-border)] bg-[var(--pt-surface)] overflow-hidden grid lg:grid-cols-2">
        {/* inputs */}
        <div className="p-8 sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--pt-green-600)]">See your number</p>
          <h2 className="font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-tight mt-2">What could you save a month?</h2>
          <p className="mt-2 text-[var(--pt-text-secondary)]">Drag the sliders to your pharmacy.</p>

          <div className="mt-8 space-y-7">
            <Slider label="Monthly inventory value" value={stockValue} min={50_000} max={3_000_000} step={50_000} onChange={setStockValue} display={fmt(stockValue)} />
            <Slider label="Stock lost to expiry" value={wastePct} min={1} max={15} step={1} onChange={setWastePct} display={`${wastePct}%`} />
            <Slider label="Staff members" value={staff} min={1} max={30} step={1} onChange={setStaff} display={`${staff}`} />
          </div>
        </div>

        {/* result */}
        <div className="relative mk-mesh mk-grain p-8 sm:p-10 flex flex-col justify-center border-t lg:border-t-0 lg:border-l border-[var(--pt-border)]">
          <div className="relative">
            <div className="inline-flex items-center gap-2 rounded-full bg-[var(--pt-surface)]/70 backdrop-blur px-3 py-1.5 text-xs font-semibold text-[var(--pt-green-700)]">
              <TrendingUp size={14} /> Estimated monthly saving
            </div>
            <p className="font-[family-name:var(--font-display)] text-5xl sm:text-6xl font-extrabold tracking-tight text-[var(--pt-green-700)] mt-4 tabular-nums">
              {fmt(total)}
            </p>
            <div className="mt-6 space-y-2.5 text-sm">
              <Row label="Recovered expiry waste" value={fmt(expirySaved)} />
              <Row label="Time saved (admin & counting)" value={fmt(timeSaved)} />
            </div>
            <p className="mt-6 text-xs text-[var(--pt-text-tertiary)] max-w-sm">
              A conservative estimate, not a guarantee — actual results depend on your pharmacy. Most plans pay for themselves in the first week.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

function Slider({ label, value, min, max, step, onChange, display }: {
  label: string; value: number; min: number; max: number; step: number; onChange: (n: number) => void; display: string
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <label className="text-sm font-medium text-[var(--pt-text-secondary)]">{label}</label>
        <span className="font-[family-name:var(--font-display)] font-bold tabular-nums">{display}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-2 rounded-full appearance-none cursor-pointer accent-[var(--pt-green)] bg-[var(--pt-muted-strong)]"
      />
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--pt-border)]/60 pb-2">
      <span className="text-[var(--pt-text-secondary)]">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  )
}
