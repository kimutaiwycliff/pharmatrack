import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { dbAdmin, staff_profile, platform_admin, subscription } from "@pharmatrack/db"
import { auth } from "./server"
import { effectiveSubscriptionStatus, ACTIVE_STATUSES } from "@/lib/billing/subscription-status"

export type Role = "owner" | "manager" | "pharmacist" | "cashier"
const RANK: Record<Role, number> = { owner: 4, manager: 3, pharmacist: 2, cashier: 1 }

/** Current Better Auth session (or null). */
export async function getSession() {
  return auth.api.getSession({ headers: await headers() })
}

export interface TenantContext {
  userId: string
  organizationId: string
  role: Role
  branchId: string | null
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
  return {
    userId: session.user.id,
    organizationId: sp.organization_id,
    role: sp.role as Role,
    branchId: sp.branch_id,
  }
}

/** Require a signed-in tenant member; redirect to /login otherwise. */
export async function requireTenant(): Promise<TenantContext> {
  const ctx = await getTenantContext()
  if (!ctx) redirect("/login")
  return ctx
}

/** Enforce a minimum role; bounce to /dashboard when insufficient. */
export async function requireRole(min: Role): Promise<TenantContext> {
  const ctx = await requireTenant()
  if (RANK[ctx.role] < RANK[min]) redirect("/dashboard")
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
 */
export async function requireActiveSubscription(organizationId: string): Promise<NextResponse | null> {
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
