import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { z } from "zod"
import { queueReminders } from "@/lib/appointments/queue"

const WRITE_ROLES = ["owner", "manager", "pharmacist"]

const SELECT =
  "*, customer:customers(id, full_name, phone, email, reminders_opt_in), assignee:profiles!appointments_assigned_to_fkey(id, full_name)"

const createSchema = z.object({
  // Either an existing customer id, or details to find-or-create one.
  customer_id: z.string().uuid().optional(),
  customer_name: z.string().trim().min(1).max(120).optional(),
  customer_phone: z.string().trim().max(40).optional(),
  customer_email: z.string().trim().email().max(120).optional().or(z.literal("")),

  branch_id: z.string().uuid(),
  service: z.string().min(1),
  service_label: z.string().max(120).optional(),
  scheduled_at: z.string().datetime({ offset: true }),
  duration_minutes: z.number().int().positive().max(480).default(15),
  assigned_to: z.string().uuid().nullable().optional(),
  notes: z.string().max(1000).optional(),
  parent_appointment_id: z.string().uuid().nullable().optional(),
  reminders_opt_in: z.boolean().default(true),
})

export async function GET(request: NextRequest) {
  const sp = new URL(request.url).searchParams
  const from = sp.get("from")
  const to = sp.get("to")
  const status = sp.get("status")
  const branchId = sp.get("branch_id")
  const q = sp.get("q")?.trim()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single()
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 })

  let query = supabase
    .from("appointments")
    .select(SELECT)
    .eq("organization_id", profile.organization_id)
    .order("scheduled_at", { ascending: true })

  if (from) query = query.gte("scheduled_at", from)
  if (to) query = query.lte("scheduled_at", to)
  if (status && status !== "all") query = query.eq("status", status)
  if (branchId) query = query.eq("branch_id", branchId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let rows = data ?? []
  // Filter by customer name/phone client-side (joined column can't be filtered in the same query simply)
  if (q) {
    const needle = q.toLowerCase()
    rows = rows.filter((r) => {
      const c = (r as { customer: { full_name?: string; phone?: string } | null }).customer
      return (
        c?.full_name?.toLowerCase().includes(needle) ||
        c?.phone?.includes(q)
      )
    })
  }

  return NextResponse.json({ appointments: rows })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id, role")
    .eq("id", user.id)
    .single()
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 })
  if (!WRITE_ROLES.includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const parsed = createSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 })
  }
  const d = parsed.data
  const orgId = profile.organization_id

  // ── Resolve the customer (find existing by phone, else create) ──
  let customerId = d.customer_id ?? null
  if (!customerId) {
    if (!d.customer_name) {
      return NextResponse.json({ error: "Customer name is required" }, { status: 400 })
    }
    if (d.customer_phone) {
      const { data: existing } = await supabase
        .from("customers")
        .select("id")
        .eq("organization_id", orgId)
        .eq("phone", d.customer_phone)
        .maybeSingle()
      customerId = existing?.id ?? null
    }
    if (!customerId) {
      const { data: created, error: custErr } = await supabase
        .from("customers")
        .insert({
          organization_id: orgId,
          full_name: d.customer_name,
          phone: d.customer_phone || null,
          email: d.customer_email || null,
          reminders_opt_in: d.reminders_opt_in,
          created_by: user.id,
        })
        .select("id")
        .single()
      if (custErr || !created) {
        return NextResponse.json({ error: custErr?.message ?? "Failed to create customer" }, { status: 500 })
      }
      customerId = created.id
    }
  }

  // Persist the messaging preference on the (existing or just-found) customer.
  await supabase.from("customers").update({ reminders_opt_in: d.reminders_opt_in }).eq("id", customerId).eq("organization_id", orgId)

  // ── Insert the appointment ──
  const { data: appt, error } = await supabase
    .from("appointments")
    .insert({
      organization_id: orgId,
      branch_id: d.branch_id,
      customer_id: customerId,
      service: d.service,
      service_label: d.service_label ?? null,
      scheduled_at: d.scheduled_at,
      duration_minutes: d.duration_minutes,
      assigned_to: d.assigned_to ?? null,
      notes: d.notes || null,
      parent_appointment_id: d.parent_appointment_id ?? null,
      created_by: user.id,
    })
    .select(SELECT)
    .single()
  if (error || !appt) {
    return NextResponse.json({ error: error?.message ?? "Failed to create appointment" }, { status: 500 })
  }

  // ── Queue reminders ──
  await queueReminders(supabase, appt as { id: string; scheduled_at: string; assigned_to: string | null; customer: { phone: string | null; email: string | null } | null }, orgId)

  return NextResponse.json({ appointment: appt }, { status: 201 })
}
