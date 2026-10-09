import { redirect } from "next/navigation"
import { Providers } from "@/components/providers"
import { PosShell } from "@/components/pos/PosShell"
import { SubscriptionGate } from "@/components/SubscriptionGate"
import { loadAppShell } from "@/lib/auth/app-shell"

export default async function PosLayout({ children }: { children: React.ReactNode }) {
  const shell = await loadAppShell()
  if (!shell) redirect("/login")
  const { branches, subStatus, trialExpired, userId, planCode, profile, permissions } = shell

  // SaaS gate: block access if the tenant's subscription isn't active/trialing.
  if (!subStatus || !["trialing", "active"].includes(subStatus)) {
    return <SubscriptionGate status={subStatus ?? "none"} trialExpired={trialExpired} isOwner={permissions.includes("billing.manage")} />
  }

  return (
    <Providers profile={profile} branches={branches} planCode={planCode} permissions={permissions}>
      <PosShell userId={userId}>{children}</PosShell>
    </Providers>
  )
}
