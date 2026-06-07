import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { Sidebar } from "@/components/layout/Sidebar"
import { AppTopBar } from "@/components/layout/AppTopBar"
import { Providers } from "@/components/providers"
import { SubscriptionGate } from "@/components/SubscriptionGate"
import type { Profile, Branch } from "@pharmatrack/types"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single()

  if (!profileRow) redirect("/login")

  const profile = profileRow as unknown as Profile

  // Cashiers belong in POS, not dashboard
  if (profile.role === "cashier") redirect("/pos")

  // SaaS gate: block access if the tenant's subscription isn't active/trialing.
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("status")
    .eq("organization_id", profile.organization_id)
    .maybeSingle()
  if (!sub || !["trialing", "active"].includes(sub.status)) {
    return <SubscriptionGate status={sub?.status ?? "none"} isOwner={profile.role === "owner"} />
  }

  // Fetch branches for this org
  const { data: branchRows } = await supabase
    .from("branches")
    .select("*")
    .eq("organization_id", profile.organization_id)
    .eq("is_active", true)
    .order("name")

  const branches = (branchRows ?? []) as unknown as Branch[]

  return (
    <Providers profile={profile} branches={branches}>
      <div className="flex h-screen overflow-hidden bg-[var(--pt-bg)]">
        <Sidebar />
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <AppTopBar />
          <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-7">
            {children}
          </main>
        </div>
      </div>
    </Providers>
  )
}
