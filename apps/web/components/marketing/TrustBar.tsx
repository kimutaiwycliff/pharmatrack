const BADGES = ["M-Pesa", "PPB compliant", "Paystack", "Africa's Talking", "Offline-capable"]

export function TrustBar() {
  return (
    <section className="border-y border-[var(--pt-border)] bg-[var(--pt-surface)]">
      <div className="mx-auto max-w-6xl px-5 py-6">
        <p className="text-center text-xs font-semibold uppercase tracking-wider text-[var(--pt-text-secondary)] mb-4">
          Works with the tools Kenyan pharmacies already use
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
          {BADGES.map((b) => (
            <span key={b} className="font-[family-name:var(--font-display)] text-base sm:text-lg font-bold text-[var(--pt-text-secondary)]">
              {b}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}
