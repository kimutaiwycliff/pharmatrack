import { createClient, createAdminClient } from "@/lib/supabase/server"

/**
 * Resolve the current user and confirm they're a platform (SaaS operator)
 * admin. Returns the admin (service-role) client for cross-tenant work, or
 * null if the caller isn't a platform admin. Membership is checked with the
 * admin client because `platform_admins` is locked down under RLS.
 */
export async function getPlatformContext() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const admin = createAdminClient()
  const { data } = await admin
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle()
  if (!data) return null

  return { user, admin }
}

export async function isPlatformAdmin(): Promise<boolean> {
  return (await getPlatformContext()) !== null
}
