import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { Providers } from "@/components/providers"
import { PosShell } from "@/components/pos/PosShell"
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
