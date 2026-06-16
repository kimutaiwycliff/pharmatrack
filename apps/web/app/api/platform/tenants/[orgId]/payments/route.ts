import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { eq } from "drizzle-orm"
import { subscription, subscription_payment } from "@pharmatrack/db"
import { getPlatformContext } from "@/lib/platform"

const schema = z.object({
  amount_kes: z.number().positive(),
  method: z.string().max(40).optional(),
  reference: z.string().max(120).optional(),
  period_start: z.string().optional(),
  period_end: z.string().optional(),
  // When true, also set the subscription active and extend current_period_end to period_end.
  activate: z.boolean().default(true),
})

export async function POST(request: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params
  const ctx = await getPlatformContext()
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { db, user } = ctx

  const parsed = schema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 })
  const d = parsed.data

  await db.insert(subscription_payment).values({
    organization_id: orgId, amount_kes: String(d.amount_kes), method: d.method || null,
    reference: d.reference || null, period_start: d.period_start || null, period_end: d.period_end || null, recorded_by: user.id,
  })

  if (d.activate && d.period_end) {
    await db.update(subscription).set({ status: "active", current_period_end: new Date(d.period_end), updated_at: new Date() })
      .where(eq(subscription.organization_id, orgId))
  }

  return NextResponse.json({ ok: true }, { status: 201 })
}
