import { redirect } from "next/navigation"
import { eq } from "drizzle-orm"
import { dbAdmin, staff_profile } from "@pharmatrack/db"
import { homeRouteFor } from "@pharmatrack/core"
import { getSession, getTenantContext, isPlatformAdmin } from "@/lib/auth/helpers"

export const dynamic = "force-dynamic"

// Authenticated entry point — routes by identity. Login and the marketing
// "Go to app" link land here; `/` itself is the public marketing landing.
// No session → /login; platform operator → /platform; staff → the first area
// their role permissions allow (dashboard → inventory → POS). A page that
// refuses a permission redirects here with ?denied=<capability>, which is
// forwarded so the destination can explain why.
export default async function HomeRouter({ searchParams }: { searchParams: Promise<{ denied?: string; welcome?: string }> }) {
  const session = await getSession()
  if (!session?.user) redirect("/login?expired=1")

  if (await isPlatformAdmin()) redirect("/platform")

  const ctx = await getTenantContext()
  if (!ctx) {
    // Staff whose session was just ended (an unapproved device, ADR-018) sign
    // in again; someone with no pharmacy yet (a fresh Google sign-up) onboards.
    const [sp] = await dbAdmin().select({ id: staff_profile.user_id }).from(staff_profile).where(eq(staff_profile.user_id, session.user.id)).limit(1)
    redirect(sp ? "/login?expired=1" : "/onboarding")
  }
  const { denied, welcome } = await searchParams
  const home = homeRouteFor(ctx.permissions)
  // ?welcome=1 — straight after sign-up: the dashboard greets the new owner (ADR-019).
  if (denied) redirect(`${home}?denied=${encodeURIComponent(denied)}`)
  redirect(welcome === "1" ? `${home}?welcome=1` : home)
}
