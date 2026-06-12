import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { z } from "zod"
import { zUuid } from "@/lib/api/validation"
import { serviceRecurrenceWeeks } from "@/lib/appointments/services"
import { queueReminders } from "@/lib/appointments/queue"

const WRITE_ROLES = ["owner", "manager", "pharmacist"]

const SELECT =
  "*, customer:customers(id, full_name, phone, email, reminders_opt_in), assignee:profiles!appointments_assigned_to_fkey(id, full_name)"

const updateSchema = z.object({
  status: z.enum(["scheduled", "confirmed", "completed", "cancelled", "no_show"]).optional(),
  scheduled_at: z.string().datetime({ offset: true }).optional(),
  duration_minutes: z.number().int().positive().max(480).optional(),
  assigned_to: zUuid().nullable().optional(),
  service: z.string().min(1).optional(),
  notes: z.string().max(1000).nullable().optional(),
})

async function getContext() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id, role")
    .eq("id", user.id)
    .single()
  if (!profile) return { error: NextResponse.json({ error: "Profile not found" }, { status: 404 }) }
  if (!WRITE_ROLES.includes(profile.role)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  }
  return { supabase, profile }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getContext()
  if (ctx.error) return ctx.error
  const { supabase, profile } = ctx

  const parsed = updateSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 })
  }

  const { data: existing } = await supabase
    .from("appointments")
    .select("id, organization_id, service, scheduled_at")
    .eq("id", id)
    .single()
  if (!existing || existing.organization_id !== profile.organization_id) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 })
  }

  const { data: appt, error } = await supabase
    .from("appointments")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(SELECT)
    .single()
  if (error || !appt) return NextResponse.json({ error: error?.message ?? "Failed" }, { status: 500 })

  // Rescheduled → drop pending reminders and rebuild from the new time.
  if (parsed.data.scheduled_at && parsed.data.scheduled_at !== existing.scheduled_at) {
    await supabase.from("appointment_reminders").delete().eq("appointment_id", id).eq("status", "pending")
    await queueReminders(
      supabase,
      appt as { id: string; scheduled_at: string; assigned_to: string | null; customer: { phone: string | null; email: string | null } | null },
      profile.organization_id,
    )
  }

  // Cancelled/completed → no more pending reminders.
  if (parsed.data.status && ["completed", "cancelled", "no_show"].includes(parsed.data.status)) {
    await supabase.from("appointment_reminders").delete().eq("appointment_id", id).eq("status", "pending")
  }

  // Suggest the next dose for recurring services when completed.
  let nextDue: string | null = null
  if (parsed.data.status === "completed") {
    const { data: svc } = await supabase
      .from("appointment_services")
      .select("recurrence_weeks")
      .eq("organization_id", profile.organization_id)
      .eq("slug", existing.service)
      .maybeSingle()
    const weeks = svc?.recurrence_weeks ?? serviceRecurrenceWeeks(existing.service)
    if (weeks) {
      const next = new Date(existing.scheduled_at)
      next.setDate(next.getDate() + weeks * 7)
      nextDue = next.toISOString()
      await supabase.from("appointments").update({ next_due_date: nextDue.slice(0, 10) }).eq("id", id)
    }
  }

  return NextResponse.json({ appointment: appt, nextDue })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getContext()
  if (ctx.error) return ctx.error
  const { supabase, profile } = ctx

  const { data: existing } = await supabase
    .from("appointments")
    .select("id, organization_id")
    .eq("id", id)
    .single()
  if (!existing || existing.organization_id !== profile.organization_id) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 })
  }

  const { error } = await supabase.from("appointments").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
