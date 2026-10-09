import { redirect } from "next/navigation"
import { homeRouteFor } from "@pharmatrack/core"
import { getSession, getTenantContext, isPlatformAdmin } from "@/lib/auth/helpers"

export const dynamic = "force-dynamic"

// Authenticated entry point — routes by identity. Login and the marketing
// "Go to app" link land here; `/` itself is the public marketing landing.
// No session → /login; platform operator → /platform; staff → the first area
// their role permissions allow (dashboard → inventory → POS). A page that
// refuses a permission redirects here with ?denied=<capability>, which is
// forwarded so the destination can explain why.
export default async function HomeRouter({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const session = await getSession()
  if (!session?.user) redirect("/login")

  if (await isPlatformAdmin()) redirect("/platform")

  const ctx = await getTenantContext()
  // Signed in but no pharmacy yet (e.g. a fresh Google sign-up) → finish onboarding.
  if (!ctx) redirect("/onboarding")
  const { denied } = await searchParams
  const home = homeRouteFor(ctx.permissions)
  redirect(denied ? `${home}?denied=${encodeURIComponent(denied)}` : home)
}
