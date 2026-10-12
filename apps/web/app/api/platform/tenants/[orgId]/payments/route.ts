import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { subscription_payment, audit_log, type DrizzleDB } from "@pharmatrack/db"
import { getPlatformContext } from "@/lib/platform"
import { extendSubscription } from "@/lib/billing/extend"
import { notifyPaymentOutcome } from "@/lib/notifications/billing"

// Operator records a payment received outside the app (M-Pesa to the till,
// bank, cash). Activates the subscription and extends paid-until — by the
// chosen date, the number of periods, or what the amount pays for.

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
const schema = z.object({
  amount_kes: z.number().positive(),
  method: z.string().max(40).optional(),
  reference: z.string().max(120).optional(),
  period_end: ymd.optional(),
  periods: z.number().int().min(1).max(36).optional(),
  // Payment date (defaults to now) — extension stacks from the later of this
  // and the current paid-until.
  paid_on: ymd.optional(),
  notify_owner: z.boolean().default(true),
})

export async function POST(request: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params
  const ctx = await getPlatformContext()
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { db, user } = ctx

  const parsed = schema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 })
  const d = parsed.data
  const paidAt = d.paid_on ? new Date(`${d.paid_on}T12:00:00+03:00`) : new Date()

  const ext = await db.transaction(async (tx) => {
    const e = await extendSubscription(tx as unknown as DrizzleDB, {
      organizationId: orgId, paidAt, amountKes: d.amount_kes, periods: d.periods, periodEnd: d.period_end,
    })
    const [row] = await tx.insert(subscription_payment).values({
      organization_id: orgId, amount_kes: String(d.amount_kes), method: d.method || null, reference: d.reference || null,
      period_start: e.start, period_end: e.end, recorded_by: user.id, status: "confirmed", confirmed_at: new Date(),
    }).returning({ id: subscription_payment.id })
    await tx.insert(audit_log).values({
      organization_id: orgId, actor_id: user.id, action: "subscription_payment.record",
      entity: "subscription_payment", entity_id: row!.id,
      diff: { amount_kes: d.amount_kes, method: d.method ?? null, reference: d.reference ?? null, period_start: e.start, period_end: e.end, periods: e.periods },
    })
    return e
  })

  const email = d.notify_owner
    ? await notifyPaymentOutcome(orgId, { kind: "confirmed", amountKes: d.amount_kes, reference: d.reference ?? null, activeUntil: ext.currentPeriodEnd })
    : { status: "skipped" as const }

  return NextResponse.json({
    ok: true, status: "active", period_end: ext.end, current_period_end: ext.currentPeriodEnd.toISOString(),
    owner_notified: email.status === "sent",
  }, { status: 201 })
}
