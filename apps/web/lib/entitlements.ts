import "server-only"
import { redirect } from "next/navigation"
import { NextResponse } from "next/server"
import { and, eq, sql } from "drizzle-orm"
import { dbAdmin, subscription, plan, org_addon } from "@pharmatrack/db"
import {
  hasFeature, canAdd, planLimit, effectivePlanCode, entitlements,
  ADDON_LABELS, isAddonCode, type AddonCode, type Feature, type Limit, type PlanCode,
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

// ── Paid add-ons (ADR-021) ───────────────────────────────────────────────────
// A separate axis from plan features: an `org_addon` row per tenant. Each
// add-on also has a deploy-wide kill switch, off until launch, so the code can
// ship dark and be turned off again without a release.

const ADDON_SWITCH: Record<AddonCode, boolean> = {
  cashier_station: process.env.CASHIER_STATION_ENABLED === "true",
}

/** Whether an add-on is offered on this deploy at all. */
export function addonOffered(code: AddonCode): boolean {
  return ADDON_SWITCH[code]
}

/** The tenant's active add-ons (only those offered on this deploy). */
export async function activeAddons(organizationId: string): Promise<AddonCode[]> {
  if (!Object.values(ADDON_SWITCH).some(Boolean)) return []
  const rows = await dbAdmin()
    .select({ code: org_addon.addon_code })
    .from(org_addon)
    .where(and(eq(org_addon.organization_id, organizationId), eq(org_addon.status, "active")))
  return rows.map((r) => r.code).filter(isAddonCode).filter(addonOffered)
}

export async function hasAddon(organizationId: string, code: AddonCode): Promise<boolean> {
  return (await activeAddons(organizationId)).includes(code)
}

/** API guard — returns a 403 JSON response when the tenant lacks the add-on, else null. */
export async function requireAddonApi(organizationId: string, code: AddonCode): Promise<NextResponse | null> {
  if (await hasAddon(organizationId, code)) return null
  return NextResponse.json(
    { error: `This needs the ${ADDON_LABELS[code]} add-on. The owner can turn it on in Settings.`, code: "addon_locked", addon: code },
    { status: 403 },
  )
}
