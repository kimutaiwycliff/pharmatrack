import { WifiOff, Server, Building2, ShieldCheck } from "lucide-react"

const PILLARS = [
  {
    icon: WifiOff,
    title: "Sells even when the internet drops",
    body: "Our POS caches your whole catalogue on the device and queues sales offline — indefinitely, not for 24 hours. When you reconnect, everything syncs automatically with no duplicates.",
    proof: "Indefinite offline POS",
  },
  {
    icon: Server,
    title: "Your data stays yours",
    body: "Self-host the whole platform on a single server with one command, or let us run it. Either way your pharmacy's data isn't locked inside someone else's cloud.",
    proof: "Self-hostable · no lock-in",
  },
  {
    icon: Building2,
    title: "Built for one shop or fifty",
    body: "Run hundreds of isolated pharmacies on one server with database-level tenant isolation. Add branches, switch between them, and roll reports up across all of them.",
    proof: "Multi-branch, securely isolated",
  },
  {
    icon: ShieldCheck,
    title: "Compliance without the paperwork",
    body: "The PPB controlled-substances register fills itself from every dispensed sale. KRA eTIMS and SHA claims switch on per pharmacy only when you want them.",
    proof: "PPB now · eTIMS/SHA on demand",
  },
]

export function WhySection() {
  return (
    <section id="why" className="relative bg-[var(--pt-surface)] border-y border-[var(--pt-border)]">
      <div className="mx-auto max-w-6xl px-5 py-20 md:py-28">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--pt-green-600)]">Why PharmaTrack</p>
          <h2 className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl font-extrabold tracking-tight mt-2">
            Four things the others can&apos;t match.
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
