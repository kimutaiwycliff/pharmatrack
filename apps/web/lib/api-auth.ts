import { NextResponse } from "next/server"
import { getTenantContext, requireActiveSubscription, type Role } from "@/lib/auth/helpers"

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
 *
 * Enforces an active (trialing/active) subscription by default — pass
 * `allowInactiveSubscription: true` for the few routes that must keep working
 * for a locked-out tenant (billing/claim-payment; see requireActiveSubscription's
 * doc comment for the full exemption list).
 */
export async function getApiContext(
  opts?: { roles?: Role[]; allowInactiveSubscription?: boolean },
): Promise<ApiContext | { error: NextResponse }> {
  const ctx = await getTenantContext()
  if (!ctx) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  if (opts?.roles && !opts.roles.includes(ctx.role)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  }
  if (!opts?.allowInactiveSubscription) {
    const subErr = await requireActiveSubscription(ctx.organizationId)
    if (subErr) return { error: subErr }
  }
  return { userId: ctx.userId, organizationId: ctx.organizationId, role: ctx.role, branchId: ctx.branchId }
}
