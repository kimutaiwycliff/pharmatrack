import Link from "next/link"
import { ArrowRight, ShieldCheck, WifiOff, Smartphone, TrendingUp } from "lucide-react"
import { launchOfferActive, LAUNCH_TRIAL_DAYS, STANDARD_TRIAL_DAYS } from "@/lib/launch-offer"
import { getLatestDesktopRelease } from "@/lib/desktop/release"
import { DesktopDownload } from "@/components/marketing/DesktopDownload"

export async function Hero() {
  const trialDays = launchOfferActive() ? LAUNCH_TRIAL_DAYS : STANDARD_TRIAL_DAYS
  const desktopRelease = await getLatestDesktopRelease()
  return (
    <section className="relative overflow-hidden mk-mesh mk-grain">
      <div className="absolute inset-0 mk-crosses pointer-events-none" />
      <div className="relative mx-auto max-w-6xl px-5 pt-16 pb-20 md:pt-24 md:pb-28 grid lg:grid-cols-[1.05fr_0.95fr] gap-12 lg:gap-8 items-center">
        {/* Copy */}
        <div>
          <span className="mk-rise inline-flex items-center gap-2 rounded-full border border-[var(--pt-green-100)] bg-[var(--pt-surface)]/70 backdrop-blur px-3 py-1.5 text-xs font-semibold text-[var(--pt-green-700)]" style={{ animationDelay: "0ms" }}>
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--pt-green)] animate-pulse" />
            Built for Kenyan pharmacies · PPB-compliant
          </span>

          <h1 className="mk-rise font-[family-name:var(--font-display)] font-extrabold tracking-tight text-[var(--pt-text)] mt-5 text-[2.6rem] leading-[1.05] sm:text-6xl sm:leading-[1.02]" style={{ animationDelay: "70ms" }}>
            Run your whole pharmacy
            <span className="block text-[var(--pt-green-600)]">in one place.</span>
          </h1>

          <p className="mk-rise mt-5 text-lg text-[var(--pt-text-secondary)] max-w-xl leading-relaxed" style={{ animationDelay: "140ms" }}>
            POS, inventory, M-Pesa and Kenyan compliance — together in one platform that
            keeps selling even when the internet doesn&apos;t. Go live in minutes, not weeks.
          </p>

          <div className="mk-rise mt-8 flex flex-col sm:flex-row gap-3" style={{ animationDelay: "210ms" }}>
            <Link href="/signup" className="group inline-flex items-center justify-center gap-2 h-12 px-6 rounded-xl bg-[var(--pt-green)] text-white font-semibold shadow-lg shadow-[var(--pt-green)]/25 hover:bg-[var(--pt-green-600)] transition-all hover:shadow-xl hover:shadow-[var(--pt-green)]/30">
              Start your {trialDays}-day free trial
              <ArrowRight size={18} className="group-hover:translate-x-0.5 transition-transform" />
            </Link>
            <Link href="#demo" className="inline-flex items-center justify-center gap-2 h-12 px-6 rounded-xl bg-[var(--pt-surface)] border border-[var(--pt-border-strong)] text-[var(--pt-text)] font-semibold hover:bg-[var(--pt-muted-strong)] transition-colors">
              Book a demo
            </Link>
          </div>

          <p className="mk-rise mt-4 text-sm text-[var(--pt-text-tertiary)]" style={{ animationDelay: "280ms" }}>
            No card required · Free catalogue &amp; CSV import · Cancel anytime
          </p>
        </div>

        {/* Product glimpse — composed from the app's own design tokens */}
        <div className="mk-rise relative" style={{ animationDelay: "180ms" }}>
          <div className="relative rounded-2xl border border-[var(--pt-border)] bg-[var(--pt-surface)] shadow-2xl shadow-black/10 p-5">
            {/* top bar */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <span className="grid place-items-center w-6 h-6 rounded-md bg-[var(--pt-green)] text-white text-[10px]">PT</span>
                Westlands Branch
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 px-2.5 py-1 text-[11px] font-semibold">
                <WifiOff size={12} /> Offline · 3 queued
              </span>
            </div>
            {/* KPIs */}
            <div className="grid grid-cols-3 gap-2.5 mb-4">
              {[
                { l: "Today", v: "KES 48,200", c: "text-[var(--pt-text)]" },
                { l: "Sales", v: "127", c: "text-[var(--pt-text)]" },
                { l: "M-Pesa", v: "62%", c: "text-[var(--pt-green-600)]" },
              ].map((k) => (
                <div key={k.l} className="rounded-xl border border-[var(--pt-border)] bg-[var(--pt-muted)] px-3 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--pt-text-tertiary)]">{k.l}</p>
                  <p className={`text-sm font-bold tabular-nums mt-0.5 ${k.c}`}>{k.v}</p>
                </div>
              ))}
            </div>
            {/* receipt lines */}
            <div className="rounded-xl border border-[var(--pt-border)] divide-y divide-[var(--pt-border)] overflow-hidden">
              {[
                { n: "Paracetamol 500mg", q: "×20", p: "60.00" },
                { n: "Amoxicillin 500mg", q: "×10", p: "100.00" },
                { n: "ORS Sachet", q: "×3", p: "60.00" },
              ].map((r) => (
                <div key={r.n} className="flex items-center justify-between px-3.5 py-2.5 text-sm bg-[var(--pt-surface)]">
                  <span className="font-medium truncate">{r.n}</span>
                  <span className="flex items-center gap-3 shrink-0">
                    <span className="text-[var(--pt-text-tertiary)] tabular-nums text-xs">{r.q}</span>
                    <span className="font-semibold tabular-nums">{r.p}</span>
                  </span>
                </div>
              ))}
            </div>
            <button className="mt-4 w-full h-11 rounded-xl bg-[var(--pt-green)] text-white font-semibold text-sm flex items-center justify-center gap-2">
              Charge KES 220.00 · M-Pesa
            </button>
          </div>

          {/* floating accent chips */}
          <div className="mk-float absolute -left-4 -bottom-5 hidden sm:flex items-center gap-2 rounded-xl border border-[var(--pt-border)] bg-[var(--pt-surface)] shadow-xl px-3 py-2.5" style={{ animationDelay: "0.4s" }}>
            <ShieldCheck size={16} className="text-[var(--pt-green-600)]" />
            <span className="text-xs font-semibold">PPB register logged</span>
          </div>
          <div className="mk-float absolute -right-3 -top-4 hidden sm:flex items-center gap-2 rounded-xl border border-[var(--pt-border)] bg-[var(--pt-surface)] shadow-xl px-3 py-2.5" style={{ animationDelay: "1.4s" }}>
            <TrendingUp size={16} className="text-[var(--pt-green-600)]" />
            <span className="text-xs font-semibold">FEFO · expiry-safe</span>
          </div>
        </div>
      </div>

      {/* device hint strip + desktop app download */}
      <div className="relative mx-auto max-w-6xl px-5 pb-10 space-y-4">
        <p className="flex items-center gap-2 text-xs text-[var(--pt-text-tertiary)]">
          <Smartphone size={14} /> Works on any phone, tablet or till — installs like an app, runs offline.
        </p>
        <DesktopDownload release={desktopRelease} />
      </div>
    </section>
  )
}
