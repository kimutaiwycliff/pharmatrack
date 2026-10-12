import { and, desc, eq } from "drizzle-orm"
import {
  dbAdmin, withTenant, audit_log, organization, subscription, subscription_payment,
  trial_extension_request, trial_grant,
} from "@pharmatrack/db"
import { effectiveSubscriptionStatus } from "@/lib/billing/subscription-status"
import { notifyPlatformTrialExtensionRequest } from "@/lib/notifications/platform"

// Trial extension requests: an owner without a (current) trial asks the
// operator for one. Tenants create + read their own rows under RLS (migration
// 030 policies); the operator decides via dbAdmin (app/api/platform/...).

export const MAX_EXTENSION_MESSAGE = 1000

export type ExtensionRow = typeof trial_extension_request.$inferSelect

type TenantArg = Exclude<Parameters<typeof withTenant>[0], string>

/**
 * Create a pending request for `organizationId` (runs under RLS when a tenant
 * context is given, otherwise as app_owner — used right after signup, before
 * the new owner has a session), write an audit_log row and email the operator.
 * Returns `{ error }` if a request is already pending.
 */
export async function createTrialExtensionRequest(args: {
  tenant?: TenantArg
  organizationId: string
  userId: string
  email: string
  message?: string | null
}): Promise<{ request: ExtensionRow } | { error: string }> {
  const message = args.message?.trim().slice(0, MAX_EXTENSION_MESSAGE) || null
  const insert = async (db: Pick<ReturnType<typeof dbAdmin>, "select" | "insert">) => {
    const [pending] = await db.select({ id: trial_extension_request.id }).from(trial_extension_request)
      .where(and(eq(trial_extension_request.organization_id, args.organizationId), eq(trial_extension_request.status, "pending"))).limit(1)
    if (pending) return { error: "You already have a trial request waiting for review." }
    const [row] = await db.insert(trial_extension_request).values({
      organization_id: args.organizationId, user_id: args.userId, message, status: "pending",
    }).returning()
    await db.insert(audit_log).values({
      organization_id: args.organizationId, actor_id: args.userId, action: "trial_extension.request",
      entity: "trial_extension_request", entity_id: row?.id ?? null, diff: { message },
    })
    return { request: row! }
  }

  let result: { request: ExtensionRow } | { error: string }
  try {
    result = args.tenant ? await withTenant(args.tenant, insert) : await insert(dbAdmin())
  } catch (e) {
    // The partial unique index (one pending per org) settles a double-submit race.
    if (/trial_ext_one_pending|duplicate key/i.test(e instanceof Error ? e.message : "")) {
      return { error: "You already have a trial request waiting for review." }
    }
    throw e
  }
  if ("error" in result) return result

  const [org] = await dbAdmin().select({ name: organization.name }).from(organization).where(eq(organization.id, args.organizationId)).limit(1)
  await notifyPlatformTrialExtensionRequest({ pharmacy: org?.name ?? args.organizationId, organizationId: args.organizationId, email: args.email, message })
  return result
}

/**
 * Tenant-side view: whether the owner may ask for a trial, any pending request
 * and the latest decision. Eligible = the tenant is not currently on a trial or
 * a paid plan, has never had a confirmed payment, and isn't being deleted
 * (cancelled). `noTrialGranted` is true when the account was created without a
 * trial because a previous one matched (drives the explanatory copy).
 */
export async function trialExtensionStatus(organizationId: string): Promise<{
  eligible: boolean
  noTrialGranted: boolean
  pending: { id: string; created_at: string } | null
  latest: { status: string; decided_at: string | null; days_granted: number | null } | null
}> {
  const db = dbAdmin()
  const [[sub], [paid], requests, [grant]] = await Promise.all([
    db.select().from(subscription).where(eq(subscription.organization_id, organizationId)).limit(1),
    db.select({ id: subscription_payment.id }).from(subscription_payment)
      .where(and(eq(subscription_payment.organization_id, organizationId), eq(subscription_payment.status, "confirmed"))).limit(1),
    db.select().from(trial_extension_request).where(eq(trial_extension_request.organization_id, organizationId))
      .orderBy(desc(trial_extension_request.created_at)).limit(5),
    db.select({ granted: trial_grant.granted }).from(trial_grant).where(eq(trial_grant.organization_id, organizationId))
      .orderBy(desc(trial_grant.created_at)).limit(1),
  ])
  const status = effectiveSubscriptionStatus(sub ?? null)
  const pending = requests.find((r) => r.status === "pending") ?? null
  const decided = requests.find((r) => r.status !== "pending") ?? null
  return {
    eligible: !!sub && !["trialing", "active", "cancelled"].includes(status) && !paid,
    noTrialGranted: grant ? !grant.granted : false,
    pending: pending ? { id: pending.id, created_at: pending.created_at.toISOString() } : null,
    latest: decided ? { status: decided.status, decided_at: decided.decided_at?.toISOString() ?? null, days_granted: decided.days_granted } : null,
  }
}
