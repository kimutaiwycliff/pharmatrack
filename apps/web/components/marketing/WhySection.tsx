import { WifiOff, FileSpreadsheet, MonitorSmartphone, ShieldCheck } from "lucide-react"

const PILLARS = [
  {
    icon: WifiOff,
    title: "Sells all day when the internet drops",
    body: "Each till keeps your products, prices and its share of the stock on the device. Search, scan and sell from opening to closing with no connection — sales send themselves when you're back online, once each, and the till never sells stock you don't have.",
    proof: "Offline on every device",
  },
  {
    icon: FileSpreadsheet,
    title: "Switch from your old system in an afternoon",
    body: "Upload the Excel export from the system you use today. Columns are matched for you, medicines are recognised against the catalogue to fill in generic names and prescription flags, and you preview everything before it's saved.",
    proof: "Excel & CSV import",
  },
  {
    icon: MonitorSmartphone,
    title: "Phone, tablet or counter PC",
    body: "Use the Android app on a phone or tablet, the Windows app on the counter PC, or any browser — with the same stock and reports behind all of them. Owners check sales from anywhere.",
    proof: "Android · Windows · Web",
  },
  {
    icon: ShieldCheck,
    title: "Compliance without the paperwork",
    body: "The PPB controlled-substances register fills itself from every dispensed sale — pharmacist, prescriber, patient and batch — ready to export for an inspection. Every stock adjustment is logged with a reason.",
    proof: "PPB register, automated",
  },
]

export function WhySection() {
  return (
    <section id="why" className="relative bg-[var(--pt-surface)] border-y border-[var(--pt-border)]">
      <div className="mx-auto max-w-6xl px-5 py-20 md:py-28">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--pt-green-600)]">Why PharmaTrack</p>
          <h2 className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl font-extrabold tracking-tight mt-2">
            Why pharmacies switch to PharmaTrack.
          </h2>
        </div>

        <div className="mt-12 grid md:grid-cols-2 gap-5">
          {PILLARS.map(({ icon: Icon, title, body, proof }) => (
            <div key={title} className="relative rounded-2xl border border-[var(--pt-border)] bg-[var(--pt-bg)] p-7 overflow-hidden">
              <div className="grid place-items-center w-12 h-12 rounded-xl bg-[var(--pt-green)] text-white shadow-lg shadow-[var(--pt-green)]/20 mb-5">
                <Icon size={22} />
              </div>
              <h3 className="font-[family-name:var(--font-display)] text-xl font-bold tracking-tight">{title}</h3>
              <p className="mt-2.5 text-[var(--pt-text-secondary)] leading-relaxed">{body}</p>
              <span className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-[var(--pt-green-50)] text-[var(--pt-green-700)] px-3 py-1 text-xs font-semibold">
                {proof}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
