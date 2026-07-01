import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { Check, WifiOff, ShieldCheck, Rocket } from "lucide-react"
import { getSession } from "@/lib/auth/helpers"
import { SignupForm } from "@/components/marketing/SignupForm"

export const metadata: Metadata = {
  title: "Start your free 14-day trial",
  description: "Create your pharmacy on PharmaTrack in minutes — offline-capable POS, inventory, M-Pesa and PPB compliance. 14-day free trial, no card required.",
  alternates: { canonical: "/signup" },
  openGraph: {
    title: "Start your free PharmaTrack trial",
    description: "Set up your Kenyan pharmacy in minutes. 14-day free trial, no card required.",
    url: "/signup",
    type: "website",
  },
}

const PERKS = [
  { icon: Rocket, text: "Live in minutes — load the Kenyan catalogue in one click" },
  { icon: WifiOff, text: "Sells even when the internet drops" },
  { icon: ShieldCheck, text: "PPB register & M-Pesa built in" },
]

export default async function SignupPage() {
  // Signed-in users don't need to sign up — send them to their app.
  const session = await getSession()
  if (session?.user) redirect("/home")

  return (
    <section className="mx-auto max-w-6xl px-5 py-12 md:py-20 grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
      {/* Brand / value panel */}
      <div className="relative hidden lg:block">
        <div className="relative rounded-3xl mk-mesh mk-grain border border-[var(--pt-border)] p-10 overflow-hidden">
          <div className="relative">
            <h2 className="font-[family-name:var(--font-display)] text-4xl font-extrabold tracking-tight leading-[1.05]">
              Your whole pharmacy,
              <span className="block text-[var(--pt-green-700)]">running by lunchtime.</span>
            </h2>
            <ul className="mt-8 space-y-4">
              {PERKS.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-start gap-3">
                  <span className="grid place-items-center w-9 h-9 rounded-xl bg-[var(--pt-surface)] text-[var(--pt-green-600)] shadow-sm shrink-0">
                    <Icon size={18} />
                  </span>
                  <span className="text-[var(--pt-text)] font-medium pt-1.5">{text}</span>
                </li>
              ))}
            </ul>
            <div className="mt-10 flex items-center gap-2 text-sm text-[var(--pt-text-secondary)]">
              <Check size={16} className="text-[var(--pt-green-600)]" /> Trusted approach for Kenyan pharmacies
            </div>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="w-full max-w-md mx-auto lg:mx-0">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-tight">Start your free trial</h1>
        <p className="mt-2 text-[var(--pt-text-secondary)]">14 days free. No card. Cancel anytime.</p>
        <div className="mt-7">
          <SignupForm googleEnabled={!!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)} />
        </div>
      </div>
    </section>
  )
}
