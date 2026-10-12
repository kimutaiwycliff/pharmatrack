import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { and, eq } from "drizzle-orm"
import { subscription_payment, audit_log, type DrizzleDB } from "@pharmatrack/db"
import { zUuid } from "@/lib/api/validation"
import { getPlatformContext } from "@/lib/platform"
import { extendSubscription } from "@/lib/billing/extend"
import { notifyPaymentOutcome } from "@/lib/notifications/billing"

// Operator confirms or rejects an owner's self-reported ("I've paid") claim.
// Confirming ALWAYS activates the subscription and extends paid-until: by the
// date the operator picked, else by the number of periods, else by what the
// amount pays for at the plan price (one month for a standard payment).

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
const schema = z.object({
  action: z.enum(["confirm", "reject"]),
  period_end: ymd.optional(),
  periods: z.number().int().min(1).max(36).optional(),
})

class ClaimGone extends Error {}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ orgId: string; paymentId: string }> }) {
  const { orgId, paymentId } = await params
  const ctx = await getPlatformContext()
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { db, user } = ctx

  if (!zUuid().safeParse(paymentId).success) return NextResponse.json({ error: "Invalid payment id" }, { status: 400 })
  const parsed = schema.safeParse(await request.json().catch(() => undefined))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 })
  const d = parsed.data

  try {
    const result = await db.transaction(async (tx) => {
      // Flip pending → confirmed/rejected atomically; a second click (or a
      // second operator) finds nothing pending and can't extend twice.
      const [row] = await tx.update(subscription_payment).set({
        status: d.action === "confirm" ? "confirmed" : "rejected",
        recorded_by: user.id,
        ...(d.action === "confirm" ? { confirmed_at: new Date() } : {}),
      }).where(and(
        eq(subscription_payment.id, paymentId),
        eq(subscription_payment.organization_id, orgId),
        eq(subscription_payment.status, "pending"),
      )).returning()
      if (!row) throw new ClaimGone()

      const amount = Number(row.amount_kes)
      if (d.action === "reject") {
        await tx.insert(audit_log).values({
          organization_id: orgId, actor_id: user.id, action: "subscription_payment.reject",
          entity: "subscription_payment", entity_id: paymentId, diff: { amount_kes: amount, reference: row.reference },
        })
        return { amount, reference: row.reference, ext: null }
      }

      // The claim was made when the owner paid — extend from then, not from
      // whenever the operator got round to confirming it.
      const ext = await extendSubscription(tx as unknown as DrizzleDB, {
        organizationId: orgId, paidAt: row.created_at, amountKes: amount, periods: d.periods, periodEnd: d.period_end,
      })
      await tx.update(subscription_payment).set({ period_start: ext.start, period_end: ext.end })
        .where(eq(subscription_payment.id, paymentId))
      await tx.insert(audit_log).values({
        organization_id: orgId, actor_id: user.id, action: "subscription_payment.confirm",
        entity: "subscription_payment", entity_id: paymentId,
        diff: { amount_kes: amount, reference: row.reference, period_start: ext.start, period_end: ext.end, periods: ext.periods },
      })
      return { amount, reference: row.reference, ext }
    })

    const email = await notifyPaymentOutcome(orgId, result.ext
      ? { kind: "confirmed", amountKes: result.amount, reference: result.reference, activeUntil: result.ext.currentPeriodEnd }
      : { kind: "rejected", amountKes: result.amount, reference: result.reference })

    return NextResponse.json({
      ok: true,
      status: d.action === "confirm" ? "active" : null,
      period_end: result.ext?.end ?? null,
      current_period_end: result.ext?.currentPeriodEnd.toISOString() ?? null,
      owner_notified: email.status === "sent",
    })
  } catch (err) {
    if (err instanceof ClaimGone) return NextResponse.json({ error: "This claim was already handled" }, { status: 409 })
    throw err
  }
}
