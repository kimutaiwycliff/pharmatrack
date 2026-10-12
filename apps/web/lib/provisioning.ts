import { randomUUID } from "node:crypto"
import { eq } from "drizzle-orm"
import {
  dbAdmin, organization, branch, subscription, plan, member,
  staff_profile, appointment_service, org_settings, trial_grant,
} from "@pharmatrack/db"
import { auth } from "@/lib/auth/server"
import { STANDARD_TRIAL_DAYS } from "@/lib/launch-offer"
import { trialEndsAt } from "@/lib/billing/period"
import { recordTrialGrant, userExistsWithEmail, type TrialSource } from "@/lib/trials/eligibility"

// Shared tenant provisioning used by the operator console (platform/tenants) and
// self-serve signup. Creates org + default branch + trial subscription + default
// services, then the owner account (Better Auth) with membership + staff profile.
// autoSignIn is disabled globally, so creating the owner here never sets a session
// cookie — callers decide whether to sign the owner in afterwards.

/** Where the trial came from + the identity signals recorded in trial_grant. */
export interface TrialGrantContext {
  source: Exclude<TrialSource, "backfill">
  ip?: string | null
  userAgent?: string | null
  googleAccountId?: string | null
  phone?: string | null
}

export interface ProvisionInput {
  pharmacyName: string
  ownerEmail: string
  ownerName: string
  ownerPassword: string
  branchName?: string
  planCode?: string
  trialDays?: number
  /** A prior trial exists for this person: create the tenant WITHOUT a trial,
   *  gated (past_due) until they subscribe or an operator approves an extension. */
  trialDenied?: boolean
  /** Optional PPB licence number → org_settings.settings.registration_number + trial_grant. */
  registrationNumber?: string | null
  grant: TrialGrantContext
}

/** Thrown when a login already exists for the owner email — callers turn this
 *  into "An account with this email already exists — sign in". */
export class AccountExistsError extends Error {
  constructor() {
    super("An account with this email already exists")
    this.name = "AccountExistsError"
  }
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

// Create org + branch + subscription + default services, and record the trial
// decision in trial_grant (always — granted or not). Returns the ids.
//  * trialDays > 0           → "trialing" until the END of the Nairobi day
//                              trialDays from today (same convention as the
//                              operator's trial_ends_at edits).
//  * trialDenied             → "past_due", trial_ends_at = now: the app is gated
//                              on the pay / request-extension screen.
//  * trialDays = 0 (operator) → "active, pay upfront" with no period end yet.
async function createOrgScaffold(opts: {
  pharmacyName: string; branchName?: string; planCode?: string; trialDays: number
  trialDenied?: boolean; registrationNumber?: string | null
  email: string; grant: TrialGrantContext
}) {
  const db = dbAdmin()
  const orgId = randomUUID()
  const now = new Date()
  const trialing = !opts.trialDenied && opts.trialDays > 0
  const trialEnds = trialing ? trialEndsAt(opts.trialDays, now) : null
  const [planRow] = await db.select().from(plan).where(eq(plan.code, opts.planCode ?? "starter")).limit(1)

  await db.insert(organization).values({ id: orgId, name: opts.pharmacyName, createdAt: now })
  try {
    const [b] = await db.insert(branch).values({ organization_id: orgId, name: opts.branchName || "Main Branch" }).returning()
    await db.insert(subscription).values({
      organization_id: orgId,
      plan_id: planRow?.id ?? null,
      status: trialing ? "trialing" : opts.trialDenied ? "past_due" : "active",
      trial_ends_at: trialing ? trialEnds : opts.trialDenied ? now : null,
      // Only meaningful once a real paid period exists. Left null for a trial
      // (expiry is driven by trial_ends_at), for a denied trial (nothing paid
      // yet) and for a zero-trial "active, pay-upfront" provision (no period
      // end yet — an operator sets one when they record the first payment);
      // otherwise effectiveSubscriptionStatus() would treat "now" as an
      // already-lapsed period and start the dunning clock on tenants the
      // moment they're created.
      current_period_end: trialing ? trialEnds : null,
    })
    await db.insert(appointment_service).values(
      DEFAULT_SERVICES.map(([slug, label, recurrence_weeks, sort_order]) => ({
        organization_id: orgId, slug, label, recurrence_weeks, sort_order,
      })),
    )
    const regno = opts.registrationNumber?.trim()
    if (regno) {
      await db.insert(org_settings).values({ organization_id: orgId, settings: { registration_number: regno } })
    }
    await recordTrialGrant({
      organizationId: orgId,
      email: opts.email,
      googleAccountId: opts.grant.googleAccountId,
      phone: opts.grant.phone,
      registrationNumber: regno || null,
      ip: opts.grant.ip,
      userAgent: opts.grant.userAgent,
      source: opts.grant.source,
      trialDays: trialing ? opts.trialDays : 0,
      granted: trialing,
    }, db)
    return { orgId, branchId: b?.id ?? null }
  } catch (e) {
    await rollbackOrg(orgId)
    throw e
  }
}

/** Undo a half-provisioned tenant: the org (cascading its data) and its
 *  trial_grant row (which has no FK, by design, so it doesn't cascade). */
async function rollbackOrg(orgId: string) {
  const db = dbAdmin()
  await db.delete(trial_grant).where(eq(trial_grant.organization_id, orgId))
  await db.delete(organization).where(eq(organization.id, orgId))
}

async function linkOwner(orgId: string, branchId: string | null, userId: string) {
  const db = dbAdmin()
  await db.insert(member).values({ id: randomUUID(), organizationId: orgId, userId, role: "owner" })
  await db.insert(staff_profile).values({ user_id: userId, organization_id: orgId, role: "owner", branch_id: branchId })
}

/** Provision a tenant and create the owner account (email + password). */
export async function provisionTenant(input: ProvisionInput): Promise<ProvisionResult> {
  // Better Auth answers a duplicate sign-up with a generic/fake user (autoSignIn
  // is off), so check up front and fail with a clear, typed error instead.
  if (await userExistsWithEmail(input.ownerEmail)) throw new AccountExistsError()
  const { orgId, branchId } = await createOrgScaffold({ ...input, email: input.ownerEmail, trialDays: input.trialDays ?? STANDARD_TRIAL_DAYS })
  try {
    const created = await auth.api.signUpEmail({
      body: { email: input.ownerEmail, password: input.ownerPassword, name: input.ownerName },
    })
    await linkOwner(orgId, branchId, created.user.id)
    return { organizationId: orgId, ownerId: created.user.id, branchId }
  } catch (e) {
    // Roll back the org so a failed owner setup can't orphan a tenant.
    await rollbackOrg(orgId)
    throw e
  }
}

/** Provision a tenant for an EXISTING user (e.g. someone who just signed in with
 *  Google and has no pharmacy yet). No account is created. */
export async function provisionTenantForUser(input: {
  userId: string; email: string; pharmacyName: string; branchName?: string; planCode?: string; trialDays?: number
  trialDenied?: boolean; registrationNumber?: string | null; grant: TrialGrantContext
}): Promise<ProvisionResult> {
  const { orgId, branchId } = await createOrgScaffold({ ...input, trialDays: input.trialDays ?? STANDARD_TRIAL_DAYS })
  try {
    await linkOwner(orgId, branchId, input.userId)
    return { organizationId: orgId, ownerId: input.userId, branchId }
  } catch (e) {
    await rollbackOrg(orgId)
    throw e
  }
}
