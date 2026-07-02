import Link from "next/link"
import { redirect } from "next/navigation"
import { getSession, getTenantContext, isPlatformAdmin } from "@/lib/auth/helpers"
import { OnboardingForm } from "@/components/onboarding/OnboardingForm"

export const metadata = { title: "Set up your pharmacy — PharmaTrack" }
export const dynamic = "force-dynamic"

export default async function OnboardingPage() {
  const session = await getSession()
  if (!session?.user) redirect("/login")
  if (await isPlatformAdmin()) redirect("/platform")
  if (await getTenantContext()) redirect("/home") // already has a pharmacy

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--pt-bg)] px-6 py-10">
      <div className="w-full max-w-[440px]">
        <Link href="/" className="flex items-center gap-2 justify-center mb-7 w-fit mx-auto">
          <div className="w-9 h-9 rounded-lg bg-[var(--pt-green)] flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
          </div>
          <span className="text-xl font-bold tracking-tight text-[var(--pt-text)]">
            Pharma<span className="text-[var(--pt-green)]">Track</span>
          </span>
        </Link>
        <div className="bg-[var(--pt-surface)] rounded-2xl border border-[var(--pt-border)] shadow-sm p-7">
          <h1 className="text-2xl font-bold tracking-tight text-[var(--pt-text)]">
            Welcome{session.user.name ? `, ${session.user.name.split(" ")[0]}` : ""} 👋
          </h1>
          <p className="text-sm text-[var(--pt-text-secondary)] mt-1.5 mb-6">
            One last step — name your pharmacy and we&apos;ll set up your 14-day free trial.
          </p>
          <OnboardingForm />
        </div>
      </div>
    </div>
  )
}
