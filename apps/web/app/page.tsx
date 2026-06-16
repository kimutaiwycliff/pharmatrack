import { redirect } from "next/navigation"
import { getSession, getTenantContext, isPlatformAdmin } from "@/lib/auth/helpers"

export const dynamic = "force-dynamic"

// Route by identity: no session → /login; platform operator → /platform;
// cashier/pharmacist → /pos; owner/manager → /dashboard.
export default async function RootPage() {
  const session = await getSession()
  if (!session?.user) redirect("/login")

  if (await isPlatformAdmin()) redirect("/platform")

  const ctx = await getTenantContext()
  if (!ctx) redirect("/login")
  if (ctx.role === "cashier" || ctx.role === "pharmacist") redirect("/pos")
  redirect("/dashboard")
}
