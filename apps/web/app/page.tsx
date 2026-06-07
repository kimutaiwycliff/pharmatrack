import { redirect } from "next/navigation"
import { createClient, createAdminClient } from "@/lib/supabase/server"

export default async function RootPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  // Platform operators have no pharmacy profile — route them to the console.
  const admin = createAdminClient()
  const { data: platformAdmin } = await admin
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle()
  if (platformAdmin) redirect("/platform")

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()

  const role = profile?.role
  if (role === "cashier" || role === "pharmacist") redirect("/pos")
  redirect("/dashboard")
}
