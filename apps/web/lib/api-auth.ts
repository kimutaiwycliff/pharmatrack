import { NextResponse } from "next/server"
import { getTenantContext, type Role } from "@/lib/auth/helpers"

export type { Role }

export interface ApiContext {
  userId: string
  organizationId: string
  role: Role
  branchId: string | null
}

/**
 * Resolve the authenticated user + their organization and role for an API route,
 * returning a ready-made error response on any failure. Backed by Better Auth +
 * the tenant context (staff_profile); queries run via withTenant() under RLS.
 *
 *   const ctx = await getApiContext({ roles: ["owner", "manager"] })
 *   if ("error" in ctx) return ctx.error
 *   await withTenant(ctx, (db) => ...)  // passes role+branch → RLS branch lock
 */
export async function getApiContext(
  opts?: { roles?: Role[] },
): Promise<ApiContext | { error: NextResponse }> {
  const ctx = await getTenantContext()
  if (!ctx) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  if (opts?.roles && !opts.roles.includes(ctx.role)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  }
  return { userId: ctx.userId, organizationId: ctx.organizationId, role: ctx.role, branchId: ctx.branchId }
}
