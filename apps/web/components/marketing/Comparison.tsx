import { Check, Minus } from "lucide-react"

// Honest, capability-level comparison (no competitor metrics we can't verify).
const ROWS: { label: string; us: boolean | string; them: boolean | string }[] = [
  { label: "Offline POS", us: "Unlimited", them: "Time-limited" },
  { label: "Self-hosted option (own your data)", us: true, them: false },
  { label: "Multi-branch on one server", us: true, them: "Add-on" },
  { label: "M-Pesa STK Push at checkout", us: true, them: true },
  { label: "PPB controlled-substances register", us: true, them: "Partial" },
  { label: "Appointment reminders (SMS/WhatsApp)", us: true, them: false },
  { label: "Transparent pricing", us: true, them: "Varies" },
]

function Cell({ v, accent }: { v: boolean | string; accent?: boolean }) {
  if (typeof v === "string")
    return <span className={`text-sm font-semibold ${accent ? "text-[var(--pt-green-700)]" : "text-[var(--pt-text-secondary)]"}`}>{v}</span>
  return v
    ? <Check size={18} className="mx-auto text-[var(--pt-green-600)]" strokeWidth={2.5} />
    : <Minus size={18} className="mx-auto text-[var(--pt-text-tertiary)]" />
}

export function Comparison() {
  return (
    <section className="bg-[var(--pt-surface)] border-y border-[var(--pt-border)]">
      <div className="mx-auto max-w-5xl px-5 py-20 md:py-28">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--pt-green-600)]">How we compare</p>
          <h2 className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl font-extrabold tracking-tight mt-2">
            The same job, fewer compromises.
          </h2>
        </div>

        <div className="mt-10 overflow-hidden rounded-2xl border border-[var(--pt-border)]">
          <table className="w-full">
            <thead>
              <tr className="bg-[var(--pt-muted)] text-left">
                <th className="px-5 py-4 text-sm font-semibold text-[var(--pt-text-secondary)]">Capability</th>
                <th className="px-5 py-4 text-center text-sm font-[family-name:var(--font-display)] font-extrabold text-[var(--pt-green-700)]">PharmaTrack</th>
                <th className="px-5 py-4 text-center text-sm font-semibold text-[var(--pt-text-secondary)]">Typical competitor</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r, i) => (
                <tr key={r.label} className={i % 2 ? "bg-[var(--pt-surface)]" : "bg-[var(--pt-bg)]"}>
                  <td className="px-5 py-3.5 text-sm font-medium">{r.label}</td>
                  <td className="px-5 py-3.5 text-center"><Cell v={r.us} accent /></td>
                  <td className="px-5 py-3.5 text-center"><Cell v={r.them} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs text-[var(--pt-text-tertiary)]">Comparison reflects publicly described capabilities at the time of writing.</p>
      </div>
    </section>
  )
}
