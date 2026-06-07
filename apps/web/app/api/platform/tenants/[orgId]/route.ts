import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getPlatformContext } from "@/lib/platform"

export async function GET(_request: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params
  const ctx = await getPlatformContext()
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { admin } = ctx

  const { data: org, error } = await admin
    .from("organizations")
    .select("id, name, email, phone, address, created_at, subscriptions(*, plan:plans(name, price_kes, interval))")
    .eq("id", orgId)
    .single()
  if (error || !org) return NextResponse.json({ error: "Tenant not found" }, { status: 404 })

  const [{ count: branchCount }, { count: staffCount }, { data: plans }, { data: payments }] = await Promise.all([
    admin.from("branches").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
    admin.from("profiles").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
    admin.from("plans").select("id, code, name, price_kes, interval").eq("is_active", true).order("price_kes"),
    admin.from("subscription_payments").select("*").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(20),
  ])

  return NextResponse.json({
    tenant: org,
    branch_count: branchCount ?? 0,
    staff_count: staffCount ?? 0,
    plans: plans ?? [],
    payments: payments ?? [],
  })
}

const patchSchema = z.object({
  status: z.enum(["trialing", "active", "past_due", "suspended", "cancelled"]).optional(),
  plan_id: z.string().uuid().nullable().optional(),
  current_period_end: z.string().datetime({ offset: true }).nullable().optional(),
  trial_ends_at: z.string().datetime({ offset: true }).nullable().optional(),
})

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params
  const ctx = await getPlatformContext()
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { admin } = ctx

  const parsed = patchSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 })

  const { data: sub, error } = await admin
    .from("subscriptions")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("organization_id", orgId)
    .select("*")
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ subscription: sub })
}
