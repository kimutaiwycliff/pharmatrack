import Link from "next/link"
import { Cross } from "lucide-react"

const WHATSAPP_GREETING = encodeURIComponent("Hi! I'm interested in PharmaTrack for my pharmacy — can you tell me more?")

const COLS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "#features" },
      { label: "Pricing", href: "#pricing" },
      { label: "Offline POS", href: "#why" },
      { label: "Compliance", href: "#features" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Why PharmaTrack", href: "#why" },
      { label: "Book a demo", href: "#demo" },
      { label: "Contact sales", href: "mailto:sales@pharmatrack.co.ke" },
    ],
  },
  {
    title: "Get started",
    links: [
      { label: "Start free trial", href: "/signup" },
      { label: "Sign in", href: "/login" },
      { label: "WhatsApp us", href: `https://wa.me/254756412487?text=${WHATSAPP_GREETING}` },
    ],
  },
]

export function MarketingFooter() {
  return (
    <footer className="border-t border-[var(--pt-border)] bg-[var(--pt-surface)]">
      <div className="mx-auto max-w-6xl px-5 py-14 grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="grid place-items-center w-8 h-8 rounded-lg bg-[var(--pt-green)] text-white">
              <Cross size={16} strokeWidth={2.5} />
            </span>
            <span className="font-[family-name:var(--font-display)] text-lg font-extrabold tracking-tight">PharmaTrack</span>
          </div>
          <p className="text-sm text-[var(--pt-text-secondary)] max-w-xs leading-relaxed">
            All-in-one pharmacy management for Kenya — POS, inventory, M-Pesa and compliance, online or off.
          </p>
        </div>
        {COLS.map((c) => (
          <div key={c.title}>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--pt-text-tertiary)] mb-3">{c.title}</h4>
            <ul className="space-y-2.5">
              {c.links.map((l) => (
                <li key={l.label}>
                  <Link href={l.href} className="text-sm text-[var(--pt-text-secondary)] hover:text-[var(--pt-text)] transition-colors">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-[var(--pt-border)]">
        <div className="mx-auto max-w-6xl px-5 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[var(--pt-text-tertiary)]">
          <p>© {new Date().getFullYear()} PharmaTrack. Built in Kenya.</p>
          <div className="flex items-center gap-5">
            <Link href="#" className="hover:text-[var(--pt-text-secondary)]">Privacy</Link>
            <Link href="#" className="hover:text-[var(--pt-text-secondary)]">Terms</Link>
            <span>PPB-ready · Offline-capable</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
