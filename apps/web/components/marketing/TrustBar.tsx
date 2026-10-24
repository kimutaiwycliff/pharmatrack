import { CATALOGUE_SIZE_LABEL, PLAN_PRICE_KES } from "@/lib/marketing/content"

// Plain facts about the product — no customer counts or logos until we have
// real, permissioned ones.
const FACTS = [
  { v: CATALOGUE_SIZE_LABEL, l: "medicines preloaded, incl. the PPB register" },
  { v: "All day", l: "selling with no internet" },
  { v: "3 apps", l: "Android, Windows & browser" },
  { v: `KES ${PLAN_PRICE_KES.starter!.toLocaleString("en-KE")}`, l: "a month to start" },
]

export function TrustBar() {
  return (
    <section className="border-y border-[var(--pt-border)] bg-[var(--pt-surface)]">
      <div className="mx-auto max-w-6xl px-5 py-7 grid grid-cols-2 md:grid-cols-4 gap-y-6 gap-x-4">
        {FACTS.map((f) => (
          <div key={f.l} className="text-center">
            <p className="font-[family-name:var(--font-display)] text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--pt-green-700)]">{f.v}</p>
            <p className="mt-1 text-xs sm:text-sm text-[var(--pt-text-secondary)]">{f.l}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
