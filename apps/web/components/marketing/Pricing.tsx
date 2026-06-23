import Link from "next/link"
import { Check } from "lucide-react"

// Tiers mirror the entitlements catalog (packages/core/entitlements.ts) and the
// `plan` table prices. Keep features/limits in sync with PLAN_MATRIX.
const PLANS = [
  {
    name: "Starter", price: "2,500", tagline: "Single pharmacy finding its feet.",
    features: ["1 branch", "Up to 5 staff", "POS, inventory & M-Pesa", "Offline POS", "Owner dashboard", "Email support"],
    cta: "Start free trial", highlight: false,
  },
  {
    name: "Growth", price: "6,000", tagline: "Busy shops & small chains.",
    features: ["Up to 3 branches", "Unlimited staff", "Everything in Starter", "Appointments & reminders", "Prescriptions & DUR", "Reports & analytics", "Priority support"],
    cta: "Start free trial", highlight: true,
  },
  {
    name: "Enterprise", price: "Custom", tagline: "Multi-branch groups.",
    features: ["Unlimited branches", "Everything in Growth", "Centralised reporting", "Self-hosted option", "Onboarding & training", "Dedicated account manager"],
    cta: "Talk to sales", highlight: false,
  },
]

export function Pricing() {
  return (
    <section id="pricing" className="mx-auto max-w-6xl px-5 py-20 md:py-28">
      <div className="text-center max-w-2xl mx-auto">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--pt-green-600)]">Simple, honest pricing</p>
        <h2 className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl font-extrabold tracking-tight mt-2">
          Pay for a system that pays for itself.
        </h2>
        <p className="mt-3 text-[var(--pt-text-secondary)] text-lg">14-day free trial on every plan. No card required. Save 20% paying annually.</p>
      </div>

      <div className="mt-12 grid md:grid-cols-3 gap-5 items-start">
        {PLANS.map((p) => (
          <div key={p.name} className={`relative rounded-3xl border p-7 ${
            p.highlight
              ? "border-[var(--pt-green)] bg-[var(--pt-surface)] shadow-2xl shadow-[var(--pt-green)]/10 md:-translate-y-3"
              : "border-[var(--pt-border)] bg-[var(--pt-surface)]"
          }`}>
            {p.highlight && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[var(--pt-green)] text-white px-3 py-1 text-xs font-bold shadow-sm">
                Most popular
              </span>
            )}
            <h3 className="font-[family-name:var(--font-display)] text-xl font-bold">{p.name}</h3>
            <p className="text-sm text-[var(--pt-text-secondary)] mt-1 h-10">{p.tagline}</p>
            <div className="mt-3 flex items-baseline gap-1.5">
              {p.price === "Custom"
                ? <span className="font-[family-name:var(--font-display)] text-4xl font-extrabold">Custom</span>
                : <>
                    <span className="text-sm font-semibold text-[var(--pt-text-secondary)]">KES</span>
                    <span className="font-[family-name:var(--font-display)] text-4xl font-extrabold tabular-nums">{p.price}</span>
                    <span className="text-sm text-[var(--pt-text-tertiary)]">/mo</span>
                  </>}
            </div>
            <Link href={p.name === "Enterprise" ? "#demo" : "/signup"}
              className={`mt-6 flex items-center justify-center h-11 rounded-xl font-semibold text-sm transition-colors ${
                p.highlight
                  ? "bg-[var(--pt-green)] text-white hover:bg-[var(--pt-green-600)]"
                  : "border border-[var(--pt-border-strong)] hover:bg-[var(--pt-muted-strong)]"
              }`}>
              {p.cta}
            </Link>
            <ul className="mt-6 space-y-2.5">
              {p.features.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm">
                  <Check size={16} className="mt-0.5 text-[var(--pt-green-600)] shrink-0" strokeWidth={2.5} />
                  <span className="text-[var(--pt-text-secondary)]">{f}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}
