import { redirect } from "next/navigation"
import { getSession, getTenantContext, isPlatformAdmin } from "@/lib/auth/helpers"

export const dynamic = "force-dynamic"

// Authenticated entry point — routes by identity. Login and the marketing
// "Go to app" link land here; `/` itself is the public marketing landing.
// No session → /login; platform operator → /platform; cashier/pharmacist →
// /pos; owner/manager → /dashboard.
export default async function HomeRouter() {
  const session = await getSession()
  if (!session?.user) redirect("/login")

  if (await isPlatformAdmin()) redirect("/platform")

  const ctx = await getTenantContext()
  if (!ctx) redirect("/login")
  if (ctx.role === "cashier" || ctx.role === "pharmacist") redirect("/pos")
  redirect("/dashboard")
}
