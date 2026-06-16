import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { dbAdmin, subscription, subscription_payment, plan } from "@pharmatrack/db"
import { verifyWebhookSignature, addInterval } from "@/lib/billing/paystack"

export const dynamic = "force-dynamic"

interface PaystackEvent {
  event: string
  data: { reference: string; amount: number; metadata?: { organization_id?: string } }
}

// Paystack → subscription updates. Public (no session); authenticated via the
// HMAC signature. Idempotent on the transaction reference.
export async function POST(request: NextRequest) {
  const raw = await request.text()
  if (!verifyWebhookSignature(raw, request.headers.get("x-paystack-signature"))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }

  let event: PaystackEvent
  try {
    event = JSON.parse(raw) as PaystackEvent
  } catch {
    return NextResponse.json({ error: "Bad payload" }, { status: 400 })
  }

  if (event.event !== "charge.success") return NextResponse.json({ ok: true, ignored: event.event })

  const orgId = event.data.metadata?.organization_id
  const reference = event.data.reference
  const amountKes = (event.data.amount ?? 0) / 100
  if (!orgId || !reference) return NextResponse.json({ ok: true, ignored: "missing metadata" })

  const db = dbAdmin()

  // Idempotency — skip if we've already recorded this reference.
  const [existing] = await db.select({ id: subscription_payment.id }).from(subscription_payment).where(eq(subscription_payment.reference, reference)).limit(1)
  if (existing) return NextResponse.json({ ok: true, duplicate: true })

  const [sub] = await db.select({ current_period_end: subscription.current_period_end, interval: plan.interval })
    .from(subscription).leftJoin(plan, eq(plan.id, subscription.plan_id)).where(eq(subscription.organization_id, orgId)).limit(1)
  const interval = sub?.interval ?? "monthly"
  const now = new Date()
  const base = sub?.current_period_end && new Date(sub.current_period_end) > now ? new Date(sub.current_period_end) : now
  const newEnd = addInterval(base, interval)

  await db.update(subscription).set({ status: "active", current_period_end: newEnd, provider: "paystack", updated_at: now })
    .where(eq(subscription.organization_id, orgId))

  await db.insert(subscription_payment).values({
    organization_id: orgId, amount_kes: String(amountKes), method: "paystack", reference,
    period_start: base.toISOString().slice(0, 10), period_end: newEnd.toISOString().slice(0, 10),
  })

  return NextResponse.json({ ok: true })
}
