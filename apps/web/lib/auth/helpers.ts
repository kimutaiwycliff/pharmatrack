import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { dbAdmin, staff_profile, platform_admin, subscription, role_permission } from "@pharmatrack/db"
import { resolvePermissions, type Capability } from "@pharmatrack/core"
import { auth } from "./server"
import { effectiveSubscriptionStatus, ACTIVE_STATUSES } from "@/lib/billing/subscription-status"
import { OFFLINE_MODE } from "@/lib/offline-mode"

export type Role = "owner" | "manager" | "pharmacist" | "cashier"

/** Current Better Auth session (or null). */
export async function getSession() {
  return auth.api.getSession({ headers: await headers() })
}

export interface TenantContext {
  userId: string
  organizationId: string
  role: Role
  branchId: string | null
  /** Effective capabilities: role defaults + this org's overrides
   *  (packages/core/src/permissions.ts). Read fresh on every request, so a
   *  change in Settings → Roles & permissions applies to the next API call. */
  permissions: Capability[]
  /** Pinned to `branchId` at the DB layer (no `branches.all` permission). */
  branchLocked: boolean
}

/** Effective capabilities for a role in an org (defaults + stored overrides). */
export async function loadPermissions(organizationId: string, role: string): Promise<Capability[]> {
  if (role === "owner") return resolvePermissions("owner")
  const overrides = await dbAdmin()
    .select({ role: role_permission.role, capability: role_permission.capability, allowed: role_permission.allowed })
    .from(role_permission)
    .where(and(eq(role_permission.organization_id, organizationId), eq(role_permission.role, role)))
  return resolvePermissions(role, overrides)
}

export function hasPermission(ctx: { permissions: readonly Capability[] }, cap: Capability): boolean {
  return ctx.permissions.includes(cap)
}

/** Resolve the signed-in user's tenant context (org + role + branch) from
 *  staff_profile. dbAdmin is used to read the caller's OWN profile row by PK. */
export async function getTenantContext(): Promise<TenantContext | null> {
  const session = await getSession()
  if (!session?.user) return null
  const [sp] = await dbAdmin()
    .select()
    .from(staff_profile)
    .where(eq(staff_profile.user_id, session.user.id))
    .limit(1)
  if (!sp) return null
  const permissions = await loadPermissions(sp.organization_id, sp.role)
  return {
    userId: session.user.id,
    organizationId: sp.organization_id,
    role: sp.role as Role,
    branchId: sp.branch_id,
    permissions,
    branchLocked: !permissions.includes("branches.all"),
  }
}

/** Require a signed-in tenant member; redirect to /login otherwise. */
export async function requireTenant(): Promise<TenantContext> {
  const ctx = await getTenantContext()
  if (!ctx) redirect("/login")
  return ctx
}

/** Enforce a capability for a server page; bounce to /home (which routes the
 *  user to the first area they CAN use) when missing. */
export async function requirePermissionPage(cap: Capability | Capability[]): Promise<TenantContext> {
  const ctx = await requireTenant()
  const any = Array.isArray(cap) ? cap : [cap]
  if (!any.some((c) => ctx.permissions.includes(c))) redirect("/home?denied=" + encodeURIComponent(any[0]!))
  return ctx
}

/**
 * Enforce that a tenant's subscription is trialing/active before an API route
 * does tenant-data work. Returns a ready 402 response to short-circuit the
 * handler, or null when the subscription is fine.
 *
 * The page-layout gate (SubscriptionGate via loadAppShell) only blocks
 * *navigation* — a session that was already open before expiry, an offline
 * sync flush, or any client that talks to the API directly (mobile, curl)
 * was never actually blocked by it. This closes that hole at the API layer.
 *
 * Deliberately NOT called by: /api/billing* (a locked-out owner must still be
 * able to view billing + submit an "I've paid" claim), /api/mobile/me (it's
 * how the mobile client LEARNS its subscription is inactive, so it can render
 * its own gate), /api/onboarding (provisioning a brand-new tenant that has no
 * subscription yet), and the PIN-login endpoint (must keep working so a
 * blocked owner can sign in and reach the gate/claim form at all).
 *
 * ADR-014: Offline Edition installs are perpetually licensed with no billing
 * path at all — never gated, regardless of what's in the local subscription
 * table.
 */
export async function requireActiveSubscription(organizationId: string): Promise<NextResponse | null> {
  if (OFFLINE_MODE) return null
  const [sub] = await dbAdmin().select({
    status: subscription.status,
    trial_ends_at: subscription.trial_ends_at,
    current_period_end: subscription.current_period_end,
  }).from(subscription).where(eq(subscription.organization_id, organizationId)).limit(1)

  const status = sub ? effectiveSubscriptionStatus(sub) : "none"
  if (ACTIVE_STATUSES.includes(status)) return null
  return NextResponse.json({ error: "Subscription inactive — renew to continue.", subStatus: status }, { status: 402 })
}

/** True if the signed-in user is a platform operator. */
export async function isPlatformAdmin(): Promise<boolean> {
  const session = await getSession()
  if (!session?.user) return false
  const [row] = await dbAdmin()
    .select()
    .from(platform_admin)
    .where(eq(platform_admin.user_id, session.user.id))
    .limit(1)
  return !!row
}
