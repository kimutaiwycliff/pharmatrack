import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { and, eq } from "drizzle-orm"
import { withTenant, appointment, appointment_reminder, appointment_service } from "@pharmatrack/db"
import { getTenantContext, type Role } from "@/lib/auth/helpers"
import { serviceRecurrenceWeeks } from "@/lib/appointments/services"
import { queueReminders } from "@/lib/appointments/queue"
import { fetchAppointment } from "@/lib/appointments/serialize"

const WRITE_ROLES: Role[] = ["owner", "manager", "pharmacist"]

const updateSchema = z.object({
  status: z.enum(["scheduled", "confirmed", "completed", "cancelled", "no_show"]).optional(),
  scheduled_at: z.string().datetime({ offset: true }).optional(),
  duration_minutes: z.number().int().positive().max(480).optional(),
  // Not a UUID — assigned_to references Better Auth's user.id, a non-UUID text id.
  assigned_to: z.string().trim().min(1).nullable().optional(),
  service: z.string().min(1).optional(),
  notes: z.string().max(1000).nullable().optional(),
})

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!WRITE_ROLES.includes(ctx.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const parsed = updateSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 })
  const d = parsed.data

  const out = await withTenant(ctx, async (db) => {
    const [existing] = await db.select({ id: appointment.id, service: appointment.service, scheduled_at: appointment.scheduled_at })
      .from(appointment).where(eq(appointment.id, id)).limit(1)
    if (!existing) return { status: 404 as const, body: { error: "Appointment not found" } }

    const { scheduled_at, ...rest } = d
    await db.update(appointment).set({
      ...rest, ...(scheduled_at ? { scheduled_at: new Date(scheduled_at) } : {}), updated_at: new Date(),
    }).where(eq(appointment.id, id))
    const appt = (await fetchAppointment(db, id))!

    // Rescheduled → drop pending reminders and rebuild from the new time.
    if (d.scheduled_at && new Date(d.scheduled_at).getTime() !== existing.scheduled_at.getTime()) {
      await db.delete(appointment_reminder).where(and(eq(appointment_reminder.appointment_id, id), eq(appointment_reminder.status, "pending")))
      await queueReminders(db, { id: appt.id, scheduled_at: appt.scheduled_at.toISOString(), assigned_to: appt.assigned_to, customer: appt.customer }, ctx.organizationId)
    }

    // Cancelled/completed → no more pending reminders.
    if (d.status && ["completed", "cancelled", "no_show"].includes(d.status)) {
      await db.delete(appointment_reminder).where(and(eq(appointment_reminder.appointment_id, id), eq(appointment_reminder.status, "pending")))
    }

    // Suggest the next dose for recurring services when completed.
    let nextDue: string | null = null
    if (d.status === "completed" && existing.service) {
      const [svc] = await db.select({ recurrence_weeks: appointment_service.recurrence_weeks }).from(appointment_service)
        .where(eq(appointment_service.slug, existing.service)).limit(1)
      const weeks = svc?.recurrence_weeks ?? serviceRecurrenceWeeks(existing.service)
      if (weeks) {
        const next = new Date(existing.scheduled_at)
        next.setDate(next.getDate() + weeks * 7)
        nextDue = next.toISOString()
        await db.update(appointment).set({ next_due_date: nextDue.slice(0, 10) }).where(eq(appointment.id, id))
      }
    }

    return { status: 200 as const, body: { appointment: appt, nextDue } }
  })
  return NextResponse.json(out.body, { status: out.status })
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!WRITE_ROLES.includes(ctx.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const out = await withTenant(ctx, async (db) => {
    const [existing] = await db.select({ id: appointment.id }).from(appointment).where(eq(appointment.id, id)).limit(1)
    if (!existing) return { status: 404 as const, body: { error: "Appointment not found" } }
    await db.delete(appointment).where(eq(appointment.id, id))
    return { status: 200 as const, body: { ok: true } }
  })
  return NextResponse.json(out.body, { status: out.status })
}
