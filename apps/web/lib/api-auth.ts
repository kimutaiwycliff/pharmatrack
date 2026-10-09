import { NextResponse } from "next/server"
import type { Capability } from "@pharmatrack/core"
import { getTenantContext, requireActiveSubscription, type Role, type TenantContext } from "@/lib/auth/helpers"

export type { Role }

export type ApiContext = TenantContext

/** 403 body for a missing capability — `code` lets clients show a friendly
 *  "ask your owner" message instead of a generic error. */
export function forbidden(cap?: Capability) {
  return NextResponse.json(
    { error: "You don't have permission to do this. Ask the pharmacy owner to enable it in Settings → Roles & permissions.", code: "permission_denied", capability: cap ?? null },
    { status: 403 },
  )
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
  opts?: { permission?: Capability | Capability[]; allowInactiveSubscription?: boolean },
): Promise<ApiContext | { error: NextResponse }> {
  const ctx = await getTenantContext()
  if (!ctx) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  // An array means "any of these".
  const needed = opts?.permission == null ? [] : Array.isArray(opts.permission) ? opts.permission : [opts.permission]
  if (needed.length > 0 && !needed.some((c) => ctx.permissions.includes(c))) {
    return { error: forbidden(needed[0]) }
  }
  if (!opts?.allowInactiveSubscription) {
    const subErr = await requireActiveSubscription(ctx.organizationId)
    if (subErr) return { error: subErr }
  }
  return ctx
}
