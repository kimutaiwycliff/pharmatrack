import { and, asc, eq } from "drizzle-orm"
import { dbAdmin, staff_profile, branch as branchTable, subscription, plan } from "@pharmatrack/db"
import { effectivePlanCode, type PlanCode } from "@pharmatrack/core"
import type { Profile, Branch, UserRole } from "@pharmatrack/types"
import { getSession } from "./helpers"
import { effectiveSubscriptionStatus } from "@/lib/billing/subscription-status"

export interface AppShell {
  userId: string
  email: string
  profile: Profile
  branches: Branch[]
  subStatus: string | null
  /** True when the effective status is "past_due" purely because a trial ran out
   *  (never had a paid period) — lets the gate show "trial ended" instead of
   *  "payment overdue" without adding a new subscription.status enum value. */
  trialExpired: boolean
  planCode: PlanCode
}

// Loads everything the authenticated app shell (dashboard + POS layouts) needs:
// the staff profile (mapped to the legacy Profile shape), active branches, and the
// org's subscription status for the SaaS gate. Scoped explicitly by org id.
export async function loadAppShell(): Promise<AppShell | null> {
  const session = await getSession()
  if (!session?.user) return null

  const db = dbAdmin()
  const [sp] = await db.select().from(staff_profile).where(eq(staff_profile.user_id, session.user.id)).limit(1)
  if (!sp) return null

  const profile: Profile = {
    id: session.user.id,
    organization_id: sp.organization_id,
    branch_id: sp.branch_id,
    full_name: session.user.name ?? session.user.email ?? "",
    phone: sp.phone,
    role: sp.role as UserRole,
    pin_hash: null,
    is_active: sp.is_active,
    created_at: sp.created_at.toISOString(),
  }

  const [sub] = await db.select({
    status: subscription.status,
    trial_ends_at: subscription.trial_ends_at,
    current_period_end: subscription.current_period_end,
    planCode: plan.code,
  }).from(subscription)
    .leftJoin(plan, eq(plan.id, subscription.plan_id))
    .where(eq(subscription.organization_id, sp.organization_id)).limit(1)

  const branchRows = await db.select().from(branchTable)
    .where(and(eq(branchTable.organization_id, sp.organization_id), eq(branchTable.is_active, true)))
    .orderBy(asc(branchTable.name))
  const branches: Branch[] = branchRows.map((b) => ({
    id: b.id, organization_id: b.organization_id, name: b.name,
    address: b.address, phone: b.phone, is_active: b.is_active, created_at: b.created_at.toISOString(),
  }))

  const effective = sub ? effectiveSubscriptionStatus(sub) : null
  return {
    userId: session.user.id,
    email: session.user.email ?? "",
    profile,
    branches,
    subStatus: effective,
    // True when the stored status is still "trialing" (the sweep hasn't run,
    // or never will if nobody reopens the app) but the trial has actually run
    // out — i.e. this block is a lapsed trial, not a missed renewal.
    trialExpired: sub?.status === "trialing" && effective !== "trialing",
    planCode: effectivePlanCode(sub?.status, sub?.planCode),
  }
}
