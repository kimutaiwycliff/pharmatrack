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

// Create org + branch + trial subscription + default services. Returns the ids.
async function createOrgScaffold(opts: { pharmacyName: string; branchName?: string; planCode?: string; trialDays: number }) {
  const db = dbAdmin()
  const orgId = randomUUID()
  const trialEnds = new Date(Date.now() + opts.trialDays * 86_400_000)
  const [planRow] = await db.select().from(plan).where(eq(plan.code, opts.planCode ?? "starter")).limit(1)

  await db.insert(organization).values({ id: orgId, name: opts.pharmacyName, createdAt: new Date() })
  const [b] = await db.insert(branch).values({ organization_id: orgId, name: opts.branchName || "Main Branch" }).returning()
  await db.insert(subscription).values({
    organization_id: orgId,
    plan_id: planRow?.id ?? null,
    status: opts.trialDays > 0 ? "trialing" : "active",
    trial_ends_at: opts.trialDays > 0 ? trialEnds : null,
    current_period_end: trialEnds,
  })
  await db.insert(appointment_service).values(
    DEFAULT_SERVICES.map(([slug, label, recurrence_weeks, sort_order]) => ({
      organization_id: orgId, slug, label, recurrence_weeks, sort_order,
    })),
  )
  return { orgId, branchId: b?.id ?? null }
}

async function linkOwner(orgId: string, branchId: string | null, userId: string) {
  const db = dbAdmin()
  await db.insert(member).values({ id: randomUUID(), organizationId: orgId, userId, role: "owner" })
  await db.insert(staff_profile).values({ user_id: userId, organization_id: orgId, role: "owner", branch_id: branchId })
}

/** Provision a tenant and create the owner account (email + password). */
export async function provisionTenant(input: ProvisionInput): Promise<ProvisionResult> {
  const { orgId, branchId } = await createOrgScaffold({ ...input, trialDays: input.trialDays ?? 14 })
  try {
    const created = await auth.api.signUpEmail({
      body: { email: input.ownerEmail, password: input.ownerPassword, name: input.ownerName },
    })
    await linkOwner(orgId, branchId, created.user.id)
    return { organizationId: orgId, ownerId: created.user.id, branchId }
  } catch (e) {
    // Roll back the org so a failed owner setup can't orphan a tenant.
    await dbAdmin().delete(organization).where(eq(organization.id, orgId))
    throw e
  }
}

/** Provision a tenant for an EXISTING user (e.g. someone who just signed in with
 *  Google and has no pharmacy yet). No account is created. */
export async function provisionTenantForUser(input: {
  userId: string; pharmacyName: string; branchName?: string; planCode?: string; trialDays?: number
}): Promise<ProvisionResult> {
  const { orgId, branchId } = await createOrgScaffold({ ...input, trialDays: input.trialDays ?? 14 })
  try {
    await linkOwner(orgId, branchId, input.userId)
    return { organizationId: orgId, ownerId: input.userId, branchId }
  } catch (e) {
    await dbAdmin().delete(organization).where(eq(organization.id, orgId))
    throw e
  }
}
