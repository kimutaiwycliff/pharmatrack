import { NextRequest, NextResponse } from "next/server"
import { and, asc, eq, gte, inArray, lt, or, isNull, sql } from "drizzle-orm"
import { withTenant, appointment, customer, user, branch } from "@pharmatrack/db"
import { getApiContext } from "@/lib/api-auth"
import { requireFeatureApi } from "@/lib/entitlements"
import { resolveBranchScope } from "@/lib/inventory/aggregate"
import { callWindow, nairobiYmd } from "@/lib/appointments/call-list"
import { orgMessaging } from "@/lib/notifications/messaging"

// "Clients to call": today's and tomorrow's active appointments (Nairobi), for
// staff to phone the client while SMS reminders aren't switched on. Customers
// who opted out of reminders are left off. Web dashboard + Android dashboard.
export async function GET(request: NextRequest) {
  const ctx = await getApiContext({ permission: "appointments.manage" })
  if ("error" in ctx) return ctx.error
  const locked = await requireFeatureApi(ctx.organizationId, "appointments")
  if (locked) return locked

  const branchId = resolveBranchScope(ctx, new URL(request.url).searchParams.get("branch_id"))
  const w = callWindow()

  const rows = await withTenant(ctx, (db) =>
    db.select({
      id: appointment.id, scheduled_at: appointment.scheduled_at, status: appointment.status,
      service: appointment.service, service_label: appointment.service_label,
      contact_outcome: appointment.contact_outcome, contacted_at: appointment.contacted_at,
      customer_name: customer.full_name, customer_phone: customer.phone,
      assigned_id: appointment.assigned_to, assigned_name: user.name, branch_name: branch.name,
    }).from(appointment)
      .leftJoin(customer, eq(customer.id, appointment.customer_id))
      .leftJoin(user, eq(user.id, appointment.assigned_to))
      .leftJoin(branch, eq(branch.id, appointment.branch_id))
      .where(and(
        gte(appointment.scheduled_at, w.start),
        lt(appointment.scheduled_at, w.end),
        inArray(appointment.status, ["scheduled", "confirmed"]),
        or(isNull(customer.reminders_opt_in), eq(customer.reminders_opt_in, true)),
        branchId ? eq(appointment.branch_id, branchId) : undefined,
      ))
      .orderBy(asc(appointment.scheduled_at)),
  )

  const items = rows.map((r) => ({
    id: r.id,
    scheduled_at: r.scheduled_at.toISOString(),
    status: r.status,
    service_label: r.service_label ?? r.service ?? null,
    customer: { full_name: r.customer_name ?? "Customer", phone: r.customer_phone ?? null },
    assigned: r.assigned_id ? { id: r.assigned_id, name: r.assigned_name ?? null } : null,
    branch_name: r.branch_name ?? null,
    contact_outcome: r.contact_outcome ?? null,
    contacted_at: r.contacted_at?.toISOString() ?? null,
  }))
  // How many to call TOMORROW (appointments the day after) — lets the Android
  // app schedule tomorrow's 07:30 "clients to call" notification with the
  // right number whenever it's opened, not only before 07:30.
  const dayAfterStart = w.end
  const dayAfterEnd = new Date(w.end.getTime() + 86_400_000)
  const [next] = await withTenant(ctx, (db) =>
    db.select({ n: sql<number>`count(*)::int` }).from(appointment)
      .leftJoin(customer, eq(customer.id, appointment.customer_id))
      .where(and(
        gte(appointment.scheduled_at, dayAfterStart), lt(appointment.scheduled_at, dayAfterEnd),
        eq(appointment.status, "scheduled"), isNull(appointment.contact_outcome),
        or(isNull(customer.reminders_opt_in), eq(customer.reminders_opt_in, true)),
        branchId ? eq(appointment.branch_id, branchId) : undefined,
      )),
  )

  const day = (iso: string) => nairobiYmd(new Date(iso))
  return NextResponse.json({
    next_day_to_call: next?.n ?? 0,
    today: items.filter((i) => day(i.scheduled_at) === w.today),
    tomorrow: items.filter((i) => day(i.scheduled_at) === w.tomorrow),
    // Only true once this pharmacy has paid for SMS — the UI never mentions SMS otherwise.
    sms_enabled: (await orgMessaging(ctx.organizationId)).sms,
  })
}
