import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { verifyWebhookSignature, addInterval } from "@/lib/billing/paystack"

export const dynamic = "force-dynamic"

interface PaystackEvent {
  event: string
  data: {
    reference: string
    amount: number
    metadata?: { organization_id?: string }
  }
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

  const admin = createAdminClient()

  // Idempotency — skip if we've already recorded this reference.
  const { data: existing } = await admin
    .from("subscription_payments")
    .select("id")
    .eq("reference", reference)
    .maybeSingle()
  if (existing) return NextResponse.json({ ok: true, duplicate: true })

  const { data: sub } = await admin
    .from("subscriptions")
    .select("current_period_end, plan:plans(interval)")
    .eq("organization_id", orgId)
    .maybeSingle()
  const interval = (sub?.plan as { interval: string } | null)?.interval ?? "monthly"
  const now = new Date()
  const base = sub?.current_period_end && new Date(sub.current_period_end) > now ? new Date(sub.current_period_end) : now
  const newEnd = addInterval(base, interval)

  await admin
    .from("subscriptions")
    .update({ status: "active", current_period_end: newEnd.toISOString(), provider: "paystack", updated_at: now.toISOString() })
    .eq("organization_id", orgId)

  await admin.from("subscription_payments").insert({
    organization_id: orgId,
    amount_kes: amountKes,
    method: "paystack",
    reference,
    period_start: base.toISOString().slice(0, 10),
    period_end: newEnd.toISOString().slice(0, 10),
  })

  return NextResponse.json({ ok: true })
}
