import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { Providers } from "@/components/providers"
import { PosShell } from "@/components/pos/PosShell"
import { SubscriptionGate } from "@/components/SubscriptionGate"
import type { Profile, Branch } from "@pharmatrack/types"

export default async function PosLayout({ children }: { children: React.ReactNode }) {
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

  // SaaS gate: block access if the tenant's subscription isn't active/trialing.
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("status")
    .eq("organization_id", profile.organization_id)
    .maybeSingle()
  if (!sub || !["trialing", "active"].includes(sub.status)) {
    return <SubscriptionGate status={sub?.status ?? "none"} isOwner={profile.role === "owner"} />
  }

  const { data: branchRows } = await supabase
    .from("branches")
    .select("*")
    .eq("organization_id", profile.organization_id)
    .eq("is_active", true)
    .order("name")

  const branches = (branchRows ?? []) as unknown as Branch[]

  return (
    <Providers profile={profile} branches={branches}>
      <PosShell userId={user.id}>{children}</PosShell>
    </Providers>
  )
}
