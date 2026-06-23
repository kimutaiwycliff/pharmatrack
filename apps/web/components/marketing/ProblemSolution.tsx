import { CalendarX2, Receipt, ShieldAlert, Building2, FileCheck2, PackageSearch } from "lucide-react"

const ITEMS = [
  { icon: CalendarX2, problem: "Money lost to expired stock", solution: "FEFO dispensing + 90-day expiry alerts surface what to sell first." },
  { icon: PackageSearch, problem: "Stockouts and guesswork", solution: "Live stock-on-hand per branch with reorder levels and low-stock flags." },
  { icon: ShieldAlert, problem: "Cash leakage at the till", solution: "Shift floats with automatic variance and an audit log on every change." },
  { icon: Receipt, problem: "Slow, manual M-Pesa reconciliation", solution: "STK Push at checkout with callbacks matched to the sale automatically." },
  { icon: Building2, problem: "No visibility across branches", solution: "One dashboard for every branch — sales, stock and staff in real time." },
  { icon: FileCheck2, problem: "PPB compliance paperwork", solution: "The controlled-substances register fills itself from every dispensed sale, ready to export." },
]

export function ProblemSolution() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-20 md:py-28">
      <div className="max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--pt-green-600)]">The everyday grind, solved</p>
        <h2 className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl font-extrabold tracking-tight mt-2">
          Every pharmacy loses money in the same six places.
        </h2>
        <p className="mt-3 text-[var(--pt-text-secondary)] text-lg">PharmaTrack closes each gap — without adding work for your team.</p>
      </div>

      <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {ITEMS.map(({ icon: Icon, problem, solution }) => (
          <div key={problem} className="group rounded-2xl border border-[var(--pt-border)] bg-[var(--pt-surface)] p-6 hover:border-[var(--pt-green-100)] hover:shadow-lg hover:shadow-[var(--pt-green)]/5 transition-all">
            <div className="grid place-items-center w-11 h-11 rounded-xl bg-[var(--pt-green-50)] text-[var(--pt-green-600)] mb-4 group-hover:scale-105 transition-transform">
              <Icon size={20} />
            </div>
            <h3 className="font-semibold text-[var(--pt-text)] leading-snug">{problem}</h3>
            <p className="mt-2 text-sm text-[var(--pt-text-secondary)] leading-relaxed">{solution}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
