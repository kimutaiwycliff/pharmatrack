import { and, asc, eq } from "drizzle-orm"
import { dbAdmin, staff_profile, branch as branchTable, subscription, plan } from "@pharmatrack/db"
import { planOf, type PlanCode } from "@pharmatrack/core"
import type { Profile, Branch, UserRole } from "@pharmatrack/types"
import { getSession } from "./helpers"

export interface AppShell {
  userId: string
  email: string
  profile: Profile
  branches: Branch[]
  subStatus: string | null
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

  const [sub] = await db.select({ status: subscription.status, planCode: plan.code }).from(subscription)
    .leftJoin(plan, eq(plan.id, subscription.plan_id))
    .where(eq(subscription.organization_id, sp.organization_id)).limit(1)

  const branchRows = await db.select().from(branchTable)
    .where(and(eq(branchTable.organization_id, sp.organization_id), eq(branchTable.is_active, true)))
    .orderBy(asc(branchTable.name))
  const branches: Branch[] = branchRows.map((b) => ({
    id: b.id, organization_id: b.organization_id, name: b.name,
    address: b.address, phone: b.phone, is_active: b.is_active, created_at: b.created_at.toISOString(),
  }))

  return { userId: session.user.id, email: session.user.email ?? "", profile, branches, subStatus: sub?.status ?? null, planCode: planOf(sub?.planCode) }
}
