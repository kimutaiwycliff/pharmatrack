import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { and, eq } from "drizzle-orm"
import { subscription, subscription_payment } from "@pharmatrack/db"
import { zUuid } from "@/lib/api/validation"
import { getPlatformContext } from "@/lib/platform"

// Operator confirms or rejects an owner's self-reported ("I've paid") pending
// payment claim. Confirming can also activate the subscription, mirroring the
// "record payment" flow in the sibling collection route.

const schema = z.object({
  action: z.enum(["confirm", "reject"]),
  period_end: z.string().optional(),
})

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ orgId: string; paymentId: string }> }) {
  const { orgId, paymentId } = await params
  const ctx = await getPlatformContext()
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { db, user } = ctx

  const parsedId = zUuid().safeParse(paymentId)
  if (!parsedId.success) return NextResponse.json({ error: "Invalid payment id" }, { status: 400 })

  const parsed = schema.safeParse(await request.json().catch(() => undefined))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 })
  const d = parsed.data

  const [row] = await db.select().from(subscription_payment)
    .where(and(eq(subscription_payment.id, paymentId), eq(subscription_payment.organization_id, orgId), eq(subscription_payment.status, "pending")))
    .limit(1)
  if (!row) return NextResponse.json({ error: "No pending claim found" }, { status: 404 })

  await db.update(subscription_payment).set({ status: d.action === "confirm" ? "confirmed" : "rejected", recorded_by: user.id })
    .where(eq(subscription_payment.id, paymentId))

  if (d.action === "confirm" && d.period_end) {
    await db.update(subscription).set({ status: "active", current_period_end: new Date(d.period_end), updated_at: new Date() })
      .where(eq(subscription.organization_id, orgId))
  }

  return NextResponse.json({ ok: true })
}
