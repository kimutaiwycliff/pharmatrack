import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getPlatformContext } from "@/lib/platform"

const schema = z.object({
  amount_kes: z.number().positive(),
  method: z.string().max(40).optional(),
  reference: z.string().max(120).optional(),
  period_start: z.string().optional(), // YYYY-MM-DD
  period_end: z.string().optional(),
  // When true, also set the subscription active and extend current_period_end to period_end.
  activate: z.boolean().default(true),
})

export async function POST(request: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params
  const ctx = await getPlatformContext()
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { admin, user } = ctx

  const parsed = schema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 })
  const d = parsed.data

  const { error } = await admin.from("subscription_payments").insert({
    organization_id: orgId,
    amount_kes: d.amount_kes,
    method: d.method || null,
    reference: d.reference || null,
    period_start: d.period_start || null,
    period_end: d.period_end || null,
    recorded_by: user.id,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (d.activate && d.period_end) {
    await admin
      .from("subscriptions")
      .update({ status: "active", current_period_end: new Date(d.period_end).toISOString(), updated_at: new Date().toISOString() })
      .eq("organization_id", orgId)
  }

  return NextResponse.json({ ok: true }, { status: 201 })
}
