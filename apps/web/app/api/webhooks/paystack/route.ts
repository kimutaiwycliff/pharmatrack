import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { dbAdmin, subscription_payment, type DrizzleDB } from "@pharmatrack/db"
import { verifyWebhookSignature } from "@/lib/billing/paystack"
import { extendSubscription } from "@/lib/billing/extend"

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

  // One period per successful charge, stacked on any remaining time (shared
  // with the operator console so both extend paid-until identically).
  await db.transaction(async (tx) => {
    const ext = await extendSubscription(tx as unknown as DrizzleDB, { organizationId: orgId, paidAt: new Date(), periods: 1, provider: "paystack" })
    await tx.insert(subscription_payment).values({
      organization_id: orgId, amount_kes: String(amountKes), method: "paystack", reference,
      period_start: ext.start, period_end: ext.end, confirmed_at: new Date(),
    })
  })

  return NextResponse.json({ ok: true })
}
