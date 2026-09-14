import Link from "next/link"
import { Check, Sparkles } from "lucide-react"
import { launchOfferActive, LAUNCH_TRIAL_DAYS, LAUNCH_OFFER_ENDS_AT } from "@/lib/launch-offer"
import { PLAN_MATRIX, PLAN_ORDER, FEATURE_LABELS, type PlanCode, type Feature } from "@pharmatrack/core"

// Feature bullets are DERIVED from PLAN_MATRIX (packages/core/entitlements.ts)
// below, so this card can never drift from what a tier actually gates again —
// only price/tagline/CTA and non-gated perks (support tier, hosting, onboarding)
// are hand-written here, since those aren't Feature entitlements.
const MARKETING: Record<PlanCode, { price: string; tagline: string; cta: string; extras: string[] }> = {
  starter: {
    price: "1,500", tagline: "Single pharmacy finding its feet.",
    cta: "Start free trial", extras: ["Email support"],
  },
  growth: {
    price: "4,500", tagline: "Busy shops & small chains.",
    cta: "Start free trial", extras: ["Priority support"],
  },
  enterprise: {
    price: "Custom", tagline: "Multi-branch groups.",
    cta: "Talk to sales", extras: ["Self-hosted option", "Onboarding & training", "Dedicated account manager"],
  },
}

// Features that shouldn't get their own marketing bullet: multi_branch is
// already conveyed by the branches limit line below, and etims/sha are Phase 8
// — present in PLAN_MATRIX for future gating but not built/marketed yet.
const HIDDEN_FROM_MARKETING = new Set<Feature>(["multi_branch", "etims", "sha"])

function limitLines(code: PlanCode): string[] {
  const { branches, staff } = PLAN_MATRIX[code].limits
  return [
    branches === Infinity ? "Unlimited branches" : branches === 1 ? "1 branch" : `Up to ${branches} branches`,
    staff === Infinity ? "Unlimited staff" : `Up to ${staff} staff`,
  ]
}

// A tier's own features, minus whatever the tier below it already has — so
// each card reads as "everything below, plus X" instead of repeating itself.
function featureLines(code: PlanCode): string[] {
  const tierIndex = PLAN_ORDER.indexOf(code)
  const previousCode = tierIndex > 0 ? PLAN_ORDER[tierIndex - 1] : null
  const ownFeatures = PLAN_MATRIX[code].features.filter((f) => !HIDDEN_FROM_MARKETING.has(f))

  if (!previousCode) return ownFeatures.map((f) => FEATURE_LABELS[f])

  const previousFeatures = new Set(PLAN_MATRIX[previousCode].features)
  const added = ownFeatures.filter((f) => !previousFeatures.has(f))
  return [`Everything in ${PLAN_MATRIX[previousCode].label}`, ...added.map((f) => FEATURE_LABELS[f])]
}

const PLANS = PLAN_ORDER.map((code) => ({
  code,
  name: PLAN_MATRIX[code].label,
  ...MARKETING[code],
  highlight: code === "growth",
  features: [...limitLines(code), ...featureLines(code), ...MARKETING[code].extras],
}))

export function Pricing() {
  return (
    <section id="pricing" className="mx-auto max-w-6xl px-5 py-20 md:py-28">
      <div className="text-center max-w-2xl mx-auto">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--pt-green-600)]">Simple, honest pricing</p>
        <h2 className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl font-extrabold tracking-tight mt-2">
          Pay for a system that pays for itself.
        </h2>
        <p className="mt-3 text-[var(--pt-text-secondary)] text-lg">
          {launchOfferActive() ? `${LAUNCH_TRIAL_DAYS}-day free trial` : "14-day free trial"} on every plan. No card required. Save 20% paying annually.
        </p>
        {launchOfferActive() && (
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[var(--pt-green-50)] text-[var(--pt-green-600)] border border-[var(--pt-green-100)] px-3 py-1 text-xs font-semibold">
            <Sparkles size={13} /> Launch offer — {LAUNCH_TRIAL_DAYS}-day trial ends {LAUNCH_OFFER_ENDS_AT.toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" })}
          </p>
        )}
      </div>

      <div className="mt-12 grid md:grid-cols-3 gap-5 items-start">
        {PLANS.map((p) => (
          <div key={p.code} className={`relative rounded-3xl border p-7 ${
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
            <Link href={p.code === "enterprise" ? "#demo" : "/signup"}
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
