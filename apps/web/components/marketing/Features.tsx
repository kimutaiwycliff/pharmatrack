import { ScanBarcode, Boxes, BarChart3, CalendarClock, Smartphone, Users } from "lucide-react"

const FEATURES = [
  { icon: ScanBarcode, title: "Point of sale & payments", points: ["Barcode scan & GS1 parsing", "Cash, M-Pesa STK, card & split", "Thermal + A4 receipts"] },
  { icon: Boxes, title: "Inventory & FEFO", points: ["Batch & expiry tracking", "Stock adjustments + audit", "CSV import & catalogue seed"] },
  { icon: BarChart3, title: "Reports & dashboard", points: ["Daily revenue & profit", "By-cashier & top products", "Africa/Nairobi accurate"] },
  { icon: CalendarClock, title: "Appointments & reminders", points: ["Recurring services (e.g. Depo)", "Day-before SMS / WhatsApp / email", "Customer opt-in tracking"] },
  { icon: Users, title: "Staff & roles", points: ["Owner → cashier permissions", "4-digit PIN till login", "Activate / deactivate staff"] },
  { icon: Smartphone, title: "Offline-first PWA", points: ["Installs like an app", "Full catalogue cached on device", "Auto-sync on reconnect"] },
]

export function Features() {
  return (
    <section id="features" className="mx-auto max-w-6xl px-5 py-20 md:py-28">
      <div className="max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--pt-green-600)]">Everything in one platform</p>
        <h2 className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl font-extrabold tracking-tight mt-2">
          No add-ons. No integrations to wire up.
        </h2>
        <p className="mt-3 text-[var(--pt-text-secondary)] text-lg">From the first scan to the month-end report, it&apos;s already included.</p>
      </div>

      <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {FEATURES.map(({ icon: Icon, title, points }) => (
          <div key={title} className="rounded-2xl border border-[var(--pt-border)] bg-[var(--pt-surface)] p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="grid place-items-center w-10 h-10 rounded-xl bg-[var(--pt-green-50)] text-[var(--pt-green-600)]">
                <Icon size={19} />
              </div>
              <h3 className="font-semibold">{title}</h3>
            </div>
            <ul className="space-y-2">
              {points.map((p) => (
                <li key={p} className="flex items-start gap-2 text-sm text-[var(--pt-text-secondary)]">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[var(--pt-green)] shrink-0" />
                  {p}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}
