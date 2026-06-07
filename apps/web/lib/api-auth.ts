import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export type Role = "owner" | "manager" | "pharmacist" | "cashier"

type ServerClient = Awaited<ReturnType<typeof createClient>>

export interface ApiContext {
  supabase: ServerClient
  user: { id: string }
  profile: { organization_id: string; role: string }
}

/**
 * Resolve the authenticated user + their organization and role for an API
 * route, returning a ready-made error response on any failure. Replaces the
 * getUser → load profile → check role boilerplate repeated across routes.
 *
 *   const ctx = await getApiContext({ roles: ["owner", "manager"] })
 *   if ("error" in ctx) return ctx.error
 *   const { supabase, user, profile } = ctx
 */
export async function getApiContext(
  opts?: { roles?: Role[] },
): Promise<ApiContext | { error: NextResponse }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id, role")
    .eq("id", user.id)
    .single()
  if (!profile) return { error: NextResponse.json({ error: "Profile not found" }, { status: 404 }) }

  if (opts?.roles && !opts.roles.includes(profile.role as Role)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  }

  return { supabase, user, profile }
}
