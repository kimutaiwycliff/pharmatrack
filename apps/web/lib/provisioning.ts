import { randomUUID } from "node:crypto"
import { eq } from "drizzle-orm"
import {
  dbAdmin, organization, branch, subscription, plan, member,
  staff_profile, appointment_service,
} from "@pharmatrack/db"
import { auth } from "@/lib/auth/server"

// Shared tenant provisioning used by the operator console (platform/tenants) and
// self-serve signup. Creates org + default branch + trial subscription + default
// services, then the owner account (Better Auth) with membership + staff profile.
// autoSignIn is disabled globally, so creating the owner here never sets a session
// cookie — callers decide whether to sign the owner in afterwards.

export interface ProvisionInput {
  pharmacyName: string
  ownerEmail: string
  ownerName: string
  ownerPassword: string
  branchName?: string
  planCode?: string
  trialDays?: number
}

export interface ProvisionResult {
  organizationId: string
  ownerId: string
  branchId: string | null
}

const DEFAULT_SERVICES: Array<[string, string, number | null, number]> = [
  ["family_planning_depo", "Family Planning — Depo-Provera", 12, 0],
  ["vaccination", "Vaccination / Immunization", null, 1],
  ["injection", "Injection (other)", null, 2],
  ["consultation", "Consultation", null, 3],
  ["other", "Other", null, 4],
]

export async function provisionTenant(input: ProvisionInput): Promise<ProvisionResult> {
  const db = dbAdmin()
  const trialDays = input.trialDays ?? 14
  const orgId = randomUUID()
  const trialEnds = new Date(Date.now() + trialDays * 86_400_000)
  const [planRow] = await db.select().from(plan).where(eq(plan.code, input.planCode ?? "starter")).limit(1)

  // 1) Org + branch + subscription + default services.
  await db.insert(organization).values({ id: orgId, name: input.pharmacyName, createdAt: new Date() })
  const [b] = await db.insert(branch).values({ organization_id: orgId, name: input.branchName || "Main Branch" }).returning()
  await db.insert(subscription).values({
    organization_id: orgId,
    plan_id: planRow?.id ?? null,
    status: trialDays > 0 ? "trialing" : "active",
    trial_ends_at: trialDays > 0 ? trialEnds : null,
    current_period_end: trialEnds,
  })
  await db.insert(appointment_service).values(
    DEFAULT_SERVICES.map(([slug, label, recurrence_weeks, sort_order]) => ({
      organization_id: orgId, slug, label, recurrence_weeks, sort_order,
    })),
  )

  // 2) Owner account + membership + staff profile. Roll back the org on failure
  //    so a failed owner setup can't orphan a tenant.
  try {
    const created = await auth.api.signUpEmail({
      body: { email: input.ownerEmail, password: input.ownerPassword, name: input.ownerName },
    })
    const ownerId = created.user.id
    await db.insert(member).values({ id: randomUUID(), organizationId: orgId, userId: ownerId, role: "owner" })
    await db.insert(staff_profile).values({ user_id: ownerId, organization_id: orgId, role: "owner", branch_id: b?.id ?? null })
    return { organizationId: orgId, ownerId, branchId: b?.id ?? null }
  } catch (e) {
    await db.delete(organization).where(eq(organization.id, orgId))
    throw e
  }
}
