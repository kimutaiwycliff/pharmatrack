import { ScanBarcode, Boxes, BarChart3, CalendarClock, Users, Truck, ClipboardList, Wallet, Receipt } from "lucide-react"

const FEATURES = [
  { icon: ScanBarcode, title: "Till & payments", points: ["Barcode scanners & GS1 codes", "Cash, M-Pesa, card & split", "Sell by tablet, strip or box"] },
  { icon: Boxes, title: "Stock, batches & expiry", points: ["Earliest expiry sells first (FEFO)", "Expiring-soon & low-stock alerts", "Adjustments with reasons & audit"] },
  { icon: Truck, title: "Purchasing", points: ["Purchase orders to suppliers", "Receive stock by batch & expiry", "Supplier list & stock value"] },
  { icon: ClipboardList, title: "Prescriptions", points: ["Prescriptions linked to customers", "Drug-interaction checks", "Controlled-substances register"] },
  { icon: Wallet, title: "Shifts & cash-up", points: ["Opening float per shift", "Cash variance at close", "Sales by payment method"] },
  { icon: BarChart3, title: "Reports & dashboard", points: ["Daily sales & profit", "By cashier & top products", "Export to Excel / CSV"] },
  { icon: CalendarClock, title: "Return-visit reminders", points: ["Recurring services, e.g. Depo", "Daily list of clients to call", "Morning email & phone alerts"] },
  { icon: Users, title: "Staff & branches", points: ["Owner → cashier permissions", "4-digit PIN at the till", "One branch or many"] },
  { icon: Receipt, title: "Receipts", points: ["Your logo & details", "Thermal or A4", "Share by WhatsApp or PDF"] },
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
