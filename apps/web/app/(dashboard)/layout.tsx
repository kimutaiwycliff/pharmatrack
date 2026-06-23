import { Suspense } from "react"
import { redirect } from "next/navigation"
import { Sidebar } from "@/components/layout/Sidebar"
import { AppTopBar } from "@/components/layout/AppTopBar"
import { Providers } from "@/components/providers"
import { SubscriptionGate } from "@/components/SubscriptionGate"
import { LockedNotice } from "@/components/LockedNotice"
import { loadAppShell } from "@/lib/auth/app-shell"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const shell = await loadAppShell()
  if (!shell) redirect("/login")
  const { profile, branches, subStatus, planCode } = shell

  // Cashiers belong in POS, not dashboard
  if (profile.role === "cashier") redirect("/pos")

  // SaaS gate: block access if the tenant's subscription isn't active/trialing.
  if (!subStatus || !["trialing", "active"].includes(subStatus)) {
    return <SubscriptionGate status={subStatus ?? "none"} isOwner={profile.role === "owner"} />
  }

  return (
    <Providers profile={profile} branches={branches} planCode={planCode}>
      <Suspense fallback={null}><LockedNotice /></Suspense>
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
