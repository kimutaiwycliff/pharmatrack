import "server-only"
import { redirect } from "next/navigation"
import { NextResponse } from "next/server"
import { eq, sql } from "drizzle-orm"
import { dbAdmin, subscription, plan } from "@pharmatrack/db"
import {
  hasFeature, canAdd, planLimit, effectivePlanCode, entitlements,
  type Feature, type Limit, type PlanCode,
} from "@pharmatrack/core"

// Server-side entitlement resolution + guards. Plan code is read from the org's
// live subscription, so switching a tenant's plan changes gating immediately.

/** Resolve a tenant's effective plan code (Growth while trialing, else its
 *  billed plan, defaulting to Starter). */
export async function planCodeForOrg(organizationId: string): Promise<PlanCode> {
  const [row] = await dbAdmin()
    .select({ code: plan.code, status: subscription.status })
    .from(subscription)
    .leftJoin(plan, eq(plan.id, subscription.plan_id))
    .where(eq(subscription.organization_id, organizationId))
    .limit(1)
  return effectivePlanCode(row?.status, row?.code)
}

/** Count current rows of a limited resource for the org. */
async function currentCount(organizationId: string, limit: Limit): Promise<number> {
  // Lazy table imports avoid a circular edge and keep this file lean.
  const { branch, staff_profile } = await import("@pharmatrack/db")
  const table = limit === "branches" ? branch : staff_profile
  const [r] = await dbAdmin()
    .select({ n: sql<number>`count(*)::int` })
    .from(table)
    .where(eq(table.organization_id, organizationId))
  return r?.n ?? 0
}

/** API guard — returns a 403 JSON response when the plan lacks `feature`, else null. */
export async function requireFeatureApi(
  organizationId: string,
  feature: Feature,
): Promise<NextResponse | null> {
  const code = await planCodeForOrg(organizationId)
  if (hasFeature(code, feature)) return null
  return NextResponse.json(
    { error: "Your plan doesn’t include this feature. Upgrade to unlock it.", code: "feature_locked", feature, upgrade: true },
    { status: 403 },
  )
}

/** API guard — returns a 403 JSON response when adding one more would exceed the
 *  plan's limit, else null. Pass the resource's current count, or omit to have it
 *  counted for you. */
export async function requireCapacityApi(
  organizationId: string,
  limit: Limit,
  count?: number,
): Promise<NextResponse | null> {
  const code = await planCodeForOrg(organizationId)
  const n = count ?? (await currentCount(organizationId, limit))
  if (canAdd(code, limit, n)) return null
  const max = planLimit(code, limit)
  return NextResponse.json(
    {
      error: `Your ${entitlements(code).label} plan allows up to ${max} ${limit}. Upgrade to add more.`,
      code: "limit_reached", limit, max, upgrade: true,
    },
    { status: 403 },
  )
}

/** Server-component / page guard — redirects to the dashboard with a `locked`
 *  flag when the plan lacks `feature`. Use at the top of a gated page. */
export async function requireFeaturePage(organizationId: string, feature: Feature): Promise<void> {
  const code = await planCodeForOrg(organizationId)
  if (!hasFeature(code, feature)) redirect(`/dashboard?locked=${feature}`)
}
