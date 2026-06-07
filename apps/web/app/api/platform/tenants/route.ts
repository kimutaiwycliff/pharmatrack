import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getPlatformContext } from "@/lib/platform"

interface OrgRow {
  id: string
  name: string
  email: string | null
  phone: string | null
  created_at: string
  subscriptions: Array<{
    id: string
    status: string
    trial_ends_at: string | null
    current_period_end: string | null
    plan_id: string | null
    plan: { name: string } | null
  }>
}

export async function GET() {
  const ctx = await getPlatformContext()
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { admin } = ctx

  const { data: orgs, error } = await admin
    .from("organizations")
    .select("id, name, email, phone, created_at, subscriptions(id, status, trial_ends_at, current_period_end, plan_id, plan:plans(name))")
    .order("created_at", { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Tally branch/staff counts in two queries (small tenant counts).
  const [{ data: branches }, { data: profiles }] = await Promise.all([
    admin.from("branches").select("organization_id"),
    admin.from("profiles").select("organization_id"),
  ])
  const countBy = (rows: { organization_id: string }[] | null) => {
    const m = new Map<string, number>()
    for (const r of rows ?? []) m.set(r.organization_id, (m.get(r.organization_id) ?? 0) + 1)
    return m
  }
  const branchCounts = countBy(branches)
  const staffCounts = countBy(profiles)

  const tenants = ((orgs ?? []) as unknown as OrgRow[]).map((o) => {
    const sub = o.subscriptions?.[0] ?? null
    return {
      id: o.id,
      name: o.name,
      email: o.email,
      phone: o.phone,
      created_at: o.created_at,
      subscription: sub ? { id: sub.id, status: sub.status, trial_ends_at: sub.trial_ends_at, current_period_end: sub.current_period_end, plan_id: sub.plan_id } : null,
      plan_name: sub?.plan?.name ?? null,
      branch_count: branchCounts.get(o.id) ?? 0,
      staff_count: staffCounts.get(o.id) ?? 0,
    }
  })

  return NextResponse.json({ tenants })
}

const provisionSchema = z.object({
  pharmacy_name: z.string().trim().min(1).max(120),
  owner_email: z.string().trim().email(),
  owner_name: z.string().trim().min(2).max(120),
  branch_name: z.string().trim().min(1).max(120).optional(),
  plan_code: z.string().optional(),
  trial_days: z.number().int().min(0).max(120).default(14),
})

const DEFAULT_SERVICES: Array<[string, string, number | null, number]> = [
  ["family_planning_depo", "Family Planning — Depo-Provera", 13, 0],
  ["family_planning_sayana", "Family Planning — Sayana Press", 13, 1],
  ["family_planning_implant", "Family Planning — Implant review", null, 2],
  ["vaccination", "Vaccination / Immunization", null, 3],
  ["injection", "Injection (other)", null, 4],
  ["consultation", "Consultation", null, 5],
  ["other", "Other", null, 6],
]

export async function POST(request: NextRequest) {
  const ctx = await getPlatformContext()
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { admin } = ctx

  const parsed = provisionSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 })
  const d = parsed.data

  // 1. Organization
  const { data: org, error: orgErr } = await admin
    .from("organizations")
    .insert({ name: d.pharmacy_name, email: d.owner_email })
    .select("id")
    .single()
  if (orgErr || !org) return NextResponse.json({ error: orgErr?.message ?? "Failed to create org" }, { status: 500 })

  // 2. Default branch
  const { data: branch } = await admin
    .from("branches")
    .insert({ organization_id: org.id, name: d.branch_name || "Main Branch" })
    .select("id")
    .single()

  // 3. Subscription (trial)
  const { data: plan } = await admin
    .from("plans")
    .select("id")
    .eq("code", d.plan_code ?? "standard")
    .maybeSingle()
  const trialEnds = new Date(Date.now() + d.trial_days * 86_400_000).toISOString()
  await admin.from("subscriptions").insert({
    organization_id: org.id,
    plan_id: plan?.id ?? null,
    status: d.trial_days > 0 ? "trialing" : "active",
    trial_ends_at: d.trial_days > 0 ? trialEnds : null,
    current_period_end: trialEnds,
  })

  // 4. Seed appointment services
  await admin.from("appointment_services").insert(
    DEFAULT_SERVICES.map(([slug, label, recurrence_weeks, sort_order]) => ({
      organization_id: org.id, slug, label, recurrence_weeks, sort_order,
    })),
  )

  // 5. Invite the owner and create their profile
  const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(d.owner_email, {
    data: { full_name: d.owner_name, role: "owner", organization_id: org.id },
  })
  if (inviteErr || !invited.user) {
    // Roll back the org so a failed invite doesn't leave an orphan tenant.
    await admin.from("organizations").delete().eq("id", org.id)
    return NextResponse.json({ error: inviteErr?.message ?? "Failed to invite owner" }, { status: 500 })
  }
  const { error: profErr } = await admin.from("profiles").insert({
    id: invited.user.id,
    organization_id: org.id,
    full_name: d.owner_name,
    role: "owner",
    branch_id: branch?.id ?? null,
    is_active: true,
  })
  if (profErr) {
    await admin.auth.admin.deleteUser(invited.user.id)
    await admin.from("organizations").delete().eq("id", org.id)
    return NextResponse.json({ error: profErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, organization_id: org.id }, { status: 201 })
}
