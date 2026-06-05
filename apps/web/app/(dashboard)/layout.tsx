import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { Sidebar } from "@/components/layout/Sidebar"
import { AppTopBar } from "@/components/layout/AppTopBar"
import { Providers } from "@/components/providers"
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
