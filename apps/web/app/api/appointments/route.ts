import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { and, asc, eq, gte, lte } from "drizzle-orm"
import { withTenant, appointment, customer, user } from "@pharmatrack/db"
import { getTenantContext, type Role } from "@/lib/auth/helpers"
import { requireFeatureApi } from "@/lib/entitlements"
import { zUuid } from "@/lib/api/validation"
import { queueReminders } from "@/lib/appointments/queue"
import { apptCols, shapeAppt, fetchAppointment } from "@/lib/appointments/serialize"

const WRITE_ROLES: Role[] = ["owner", "manager", "pharmacist"]

const createSchema = z.object({
  customer_id: zUuid().optional(),
  customer_name: z.string().trim().min(1).max(120).optional(),
  customer_phone: z.string().trim().max(40).optional(),
  customer_email: z.string().trim().email().max(120).optional().or(z.literal("")),
  branch_id: zUuid(),
  service: z.string().min(1),
  service_label: z.string().max(120).optional(),
  scheduled_at: z.string().datetime({ offset: true }),
  duration_minutes: z.number().int().positive().max(480).default(15),
  // Not a UUID — assigned_to references Better Auth's user.id, a non-UUID text id.
  assigned_to: z.string().trim().min(1).nullable().optional(),
  notes: z.string().max(1000).optional(),
  parent_appointment_id: zUuid().nullable().optional(),
  reminders_opt_in: z.boolean().default(true),
})

export async function GET(request: NextRequest) {
  const sp = new URL(request.url).searchParams
  const from = sp.get("from"), to = sp.get("to"), status = sp.get("status"), branchId = sp.get("branch_id")
  const q = sp.get("q")?.trim()

  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const locked = await requireFeatureApi(ctx.organizationId, "appointments")
  if (locked) return locked

  return withTenant(ctx, async (db) => {
    const rows = await db.select(apptCols).from(appointment)
      .leftJoin(customer, eq(customer.id, appointment.customer_id))
      .leftJoin(user, eq(user.id, appointment.assigned_to))
      .where(and(
        from ? gte(appointment.scheduled_at, new Date(from)) : undefined,
        to ? lte(appointment.scheduled_at, new Date(to)) : undefined,
        status && status !== "all" ? eq(appointment.status, status) : undefined,
        branchId ? eq(appointment.branch_id, branchId) : undefined,
      )).orderBy(asc(appointment.scheduled_at))

    let appointments = rows.map(shapeAppt)
    if (q) {
      const needle = q.toLowerCase()
      appointments = appointments.filter((r) => r.customer?.full_name?.toLowerCase().includes(needle) || r.customer?.phone?.includes(q))
    }
    return NextResponse.json({ appointments })
  })
}

export async function POST(request: NextRequest) {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!WRITE_ROLES.includes(ctx.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const locked = await requireFeatureApi(ctx.organizationId, "appointments")
  if (locked) return locked

  const parsed = createSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 })
  const d = parsed.data

  const out = await withTenant(ctx, async (db) => {
    // ── Resolve the customer (find existing by phone, else create) ──
    let customerId = d.customer_id ?? null
    if (!customerId) {
      if (!d.customer_name) return { status: 400 as const, body: { error: "Customer name is required" } }
      if (d.customer_phone) {
        const [existing] = await db.select({ id: customer.id }).from(customer).where(eq(customer.phone, d.customer_phone)).limit(1)
        customerId = existing?.id ?? null
      }
      if (!customerId) {
        const [created] = await db.insert(customer).values({
          organization_id: ctx.organizationId, full_name: d.customer_name, phone: d.customer_phone || null,
          email: d.customer_email || null, reminders_opt_in: d.reminders_opt_in, created_by: ctx.userId,
        }).returning({ id: customer.id })
        customerId = created!.id
      }
    }
    // Persist the messaging preference on the (existing or just-found) customer.
    await db.update(customer).set({ reminders_opt_in: d.reminders_opt_in }).where(eq(customer.id, customerId!))

    const [appt] = await db.insert(appointment).values({
      organization_id: ctx.organizationId, branch_id: d.branch_id, customer_id: customerId!,
      service: d.service, service_label: d.service_label ?? null, scheduled_at: new Date(d.scheduled_at),
      duration_minutes: d.duration_minutes, assigned_to: d.assigned_to ?? null, notes: d.notes || null,
      parent_appointment_id: d.parent_appointment_id ?? null, created_by: ctx.userId,
    }).returning({ id: appointment.id })

    const shaped = (await fetchAppointment(db, appt!.id))!
    await queueReminders(db, { id: shaped.id, scheduled_at: shaped.scheduled_at.toISOString(), assigned_to: shaped.assigned_to, customer: shaped.customer }, ctx.organizationId)
    return { status: 201 as const, body: { appointment: shaped } }
  })
  return NextResponse.json(out.body, { status: out.status })
}
