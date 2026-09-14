import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { and, eq } from "drizzle-orm"
import { withTenant, subscription, plan, subscription_payment, organization, dbAdmin } from "@pharmatrack/db"
import { getApiContext } from "@/lib/api-auth"
import { getSession } from "@/lib/auth/helpers"
import { notifyPlatformPaymentClaim } from "@/lib/notifications/platform"

// Owner self-reports a manual M-Pesa payment ("I've paid"). Inserts a PENDING
// subscription_payment row (RLS lets an owner insert only 'pending' rows for
// their own org — see migration 021) and emails the platform operator to
// verify + confirm/reject it from the operator console.

const schema = z.object({
  reference: z.string().trim().min(4, "Enter the M-Pesa confirmation code").max(40),
})

export async function POST(request: NextRequest) {
  const ctx = await getApiContext({ roles: ["owner"], allowInactiveSubscription: true })
  if ("error" in ctx) return ctx.error

  const parsed = schema.safeParse(await request.json().catch(() => undefined))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 })

  const session = await getSession()
  const email = session?.user?.email
  if (!email) return NextResponse.json({ error: "No email on file" }, { status: 400 })

  const result = await withTenant(ctx, async (db) => {
    const [existingPending] = await db.select({ id: subscription_payment.id }).from(subscription_payment)
      .where(and(eq(subscription_payment.organization_id, ctx.organizationId), eq(subscription_payment.status, "pending")))
      .limit(1)
    if (existingPending) return { error: "You already have a payment awaiting confirmation." as const }

    const [planRow] = await db.select({ name: plan.name, price_kes: plan.price_kes })
      .from(subscription).leftJoin(plan, eq(plan.id, subscription.plan_id))
      .where(eq(subscription.organization_id, ctx.organizationId)).limit(1)
    if (!planRow?.name || !planRow.price_kes || Number(planRow.price_kes) <= 0) {
      return { error: "No plan price configured for your pharmacy." as const }
    }

    await db.insert(subscription_payment).values({
      organization_id: ctx.organizationId,
      amount_kes: planRow.price_kes,
      method: "mpesa",
      reference: parsed.data.reference,
      claimed_by: ctx.userId,
      status: "pending",
    })

    return { planName: planRow.name, amountKes: Number(planRow.price_kes) }
  })

  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 })

  const [org] = await dbAdmin().select({ name: organization.name }).from(organization).where(eq(organization.id, ctx.organizationId)).limit(1)
  await notifyPlatformPaymentClaim({
    pharmacy: org?.name ?? ctx.organizationId, plan: result.planName, amountKes: result.amountKes,
    reference: parsed.data.reference, email,
  })

  return NextResponse.json({ ok: true }, { status: 201 })
}
