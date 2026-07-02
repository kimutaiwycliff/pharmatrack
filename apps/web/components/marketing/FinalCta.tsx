import Link from "next/link"
import { ArrowRight, MessageCircle } from "lucide-react"

const WHATSAPP_GREETING = encodeURIComponent("Hi! I'm interested in PharmaTrack for my pharmacy — can you tell me more?")

export function FinalCta() {
  return (
    <section id="demo" className="relative overflow-hidden mk-mesh mk-grain">
      <div className="absolute inset-0 mk-crosses pointer-events-none" />
      <div className="relative mx-auto max-w-4xl px-5 py-24 md:py-32 text-center">
        <h2 className="font-[family-name:var(--font-display)] text-4xl sm:text-5xl font-extrabold tracking-tight leading-[1.05]">
          Start selling smarter
          <span className="block text-[var(--pt-green-700)]">this week.</span>
        </h2>
        <p className="mt-5 text-lg text-[var(--pt-text-secondary)] max-w-xl mx-auto">
          Spin up your pharmacy in minutes with a 14-day free trial. Keep it, or talk to us first — no pressure, no card.
        </p>
        <div className="mt-9 flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/signup" className="group inline-flex items-center justify-center gap-2 h-12 px-7 rounded-xl bg-[var(--pt-green)] text-white font-semibold shadow-lg shadow-[var(--pt-green)]/25 hover:bg-[var(--pt-green-600)] transition-all">
            Start free trial
            <ArrowRight size={18} className="group-hover:translate-x-0.5 transition-transform" />
          </Link>
          <a href={`https://wa.me/254756412487?text=${WHATSAPP_GREETING}`} className="inline-flex items-center justify-center gap-2 h-12 px-7 rounded-xl bg-[var(--pt-surface)] border border-[var(--pt-border-strong)] font-semibold hover:bg-[var(--pt-muted-strong)] transition-colors">
            <MessageCircle size={18} className="text-[var(--pt-green-600)]" /> Chat on WhatsApp
          </a>
        </div>
        <p className="mt-5 text-sm text-[var(--pt-text-tertiary)]">Already onboard? <Link href="/login" className="font-semibold text-[var(--pt-green-700)] hover:underline">Sign in</Link></p>
      </div>
    </section>
  )
}
