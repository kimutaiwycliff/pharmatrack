import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { and, eq } from "drizzle-orm"
import { audit_log, org_settings, subscription, trial_extension_request } from "@pharmatrack/db"
import { getPlatformContext } from "@/lib/platform"
import { STANDARD_TRIAL_DAYS } from "@/lib/launch-offer"
import { trialEndsAt } from "@/lib/billing/period"
import { notifyTrialExtensionOutcome, ownerContact } from "@/lib/notifications/billing"
import { googleAccountIdFor, recordTrialGrant, requestSignals } from "@/lib/trials/eligibility"
import { zUuid } from "@/lib/api/validation"

// Operator decides a tenant's trial extension request.
//  * approve → subscription "trialing" until the end of the Nairobi day `days`
//    from today (default STANDARD_TRIAL_DAYS); a granted trial_grant row
//    (source 'operator') is recorded so the ledger stays complete.
//  * decline → request closed; the tenant stays gated until they pay.
// Every decision is audit-logged and the owner is emailed the outcome.

const schema = z.object({
  decision: z.enum(["approve", "decline"]),
  days: z.number().int().min(1).max(90).default(STANDARD_TRIAL_DAYS),
})

export async function POST(request: NextRequest, { params }: { params: Promise<{ orgId: string; requestId: string }> }) {
  const { orgId, requestId } = await params
  const ctx = await getPlatformContext()
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  if (!zUuid().safeParse(requestId).success) return NextResponse.json({ error: "Invalid request id" }, { status: 400 })

  const parsed = schema.safeParse(await request.json().catch(() => undefined))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 })
  const { decision, days } = parsed.data
  const { db, user: actor } = ctx
  const now = new Date()
  const endsAt = trialEndsAt(days, now)

  const result = await db.transaction(async (tx) => {
    // Close the request only if it's still pending (guards double clicks / two operators).
    const [req] = await tx.update(trial_extension_request).set({
      status: decision === "approve" ? "approved" : "declined",
      days_granted: decision === "approve" ? days : null,
      decided_by: actor.id,
      decided_at: now,
    }).where(and(
      eq(trial_extension_request.id, requestId),
      eq(trial_extension_request.organization_id, orgId),
      eq(trial_extension_request.status, "pending"),
    )).returning()
    if (!req) return { error: "This request was already decided or doesn't exist." as const }

    if (decision === "approve") {
      const [sub] = await tx.update(subscription).set({
        status: "trialing", trial_ends_at: endsAt, current_period_end: endsAt, updated_at: now,
      }).where(eq(subscription.organization_id, orgId)).returning({ id: subscription.id })
      if (!sub) throw new Error("Tenant has no subscription row")
    }

    await tx.insert(audit_log).values({
      organization_id: orgId, actor_id: actor.id,
      action: decision === "approve" ? "trial_extension.approve" : "trial_extension.decline",
      entity: "trial_extension_request", entity_id: req.id,
      diff: decision === "approve" ? { days, trial_ends_at: endsAt.toISOString() } : {},
    })
    return { request: req }
  })

  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 409 })

  if (decision === "approve") {
    // Ledger entry for the granted trial (best-effort — the decision stands).
    try {
      const owner = await ownerContact(orgId)
      const [settings] = await db.select({ settings: org_settings.settings }).from(org_settings).where(eq(org_settings.organization_id, orgId)).limit(1)
      const regno = (settings?.settings as { registration_number?: string } | undefined)?.registration_number ?? null
      const ownerUserId = result.request.user_id
      const signals = requestSignals(request)
      if (owner) {
        await recordTrialGrant({
          organizationId: orgId, email: owner.email,
          googleAccountId: ownerUserId ? await googleAccountIdFor(ownerUserId) : null,
          registrationNumber: regno, ip: signals.ip, userAgent: signals.userAgent,
          source: "operator", trialDays: days, granted: true,
        }, db)
      }
    } catch (e) {
      console.error("[platform] could not record trial_grant for approved extension", e)
    }
  }

  const email = await notifyTrialExtensionOutcome(orgId, decision === "approve" ? { kind: "approved", days, endsAt } : { kind: "declined" })
  return NextResponse.json({
    ok: true,
    status: result.request.status,
    trial_ends_at: decision === "approve" ? endsAt.toISOString() : null,
    email: email.status,
  })
}
