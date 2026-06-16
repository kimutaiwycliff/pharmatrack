import { NextRequest, NextResponse } from "next/server"
import { and, eq, lte } from "drizzle-orm"
import { dbAdmin, appointment_reminder, appointment, customer, branch, organization, user, staff_profile } from "@pharmatrack/db"
import { sendSms } from "@/lib/notifications/sms"
import { sendEmail } from "@/lib/notifications/email"
import { sendWhatsApp } from "@/lib/notifications/whatsapp"
import { customerSms, pharmacistSms, customerEmail, type MessageContext } from "@/lib/appointments/reminders"

// Runs on a schedule. Sends any due, pending reminders.
// Secured by CRON_SECRET (`Authorization: Bearer <secret>`).
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get("authorization")
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const db = dbAdmin()
  const rows = await db.select({
    id: appointment_reminder.id, channel: appointment_reminder.channel, recipient: appointment_reminder.recipient,
    scheduled_at: appointment.scheduled_at, service: appointment.service, service_label: appointment.service_label, status: appointment.status,
    c_name: customer.full_name, c_phone: customer.phone, c_email: customer.email, c_opt: customer.reminders_opt_in,
    branch_name: branch.name, org_name: organization.name,
    a_name: user.name, a_phone: staff_profile.phone,
  }).from(appointment_reminder)
    .leftJoin(appointment, eq(appointment.id, appointment_reminder.appointment_id))
    .leftJoin(customer, eq(customer.id, appointment.customer_id))
    .leftJoin(branch, eq(branch.id, appointment.branch_id))
    .leftJoin(organization, eq(organization.id, appointment.organization_id))
    .leftJoin(user, eq(user.id, appointment.assigned_to))
    .leftJoin(staff_profile, eq(staff_profile.user_id, appointment.assigned_to))
    .where(and(eq(appointment_reminder.status, "pending"), lte(appointment_reminder.send_at, new Date())))
    .limit(200)

  let sent = 0, skipped = 0, failed = 0

  for (const r of rows) {
    // Appointment gone or no longer active → nothing to send.
    if (!r.status || !["scheduled", "confirmed"].includes(r.status)) {
      await mark(db, r.id, "skipped", "Appointment not active"); skipped++; continue
    }
    // Customer opted out of messaging after this was queued.
    if (r.c_opt === false) {
      await mark(db, r.id, "skipped", "Customer opted out"); skipped++; continue
    }

    const ctx: MessageContext = {
      customerName: r.c_name ?? "Customer",
      service: r.service_label ?? r.service ?? "appointment",
      scheduledAt: (r.scheduled_at ?? new Date()).toISOString?.() ?? String(r.scheduled_at),
      branchName: r.branch_name ?? "the pharmacy",
      orgName: r.org_name ?? "PharmaTrack",
    }

    let result: { status: "sent" | "skipped" | "failed"; error?: string }
    if (r.recipient === "customer" && r.channel === "whatsapp") {
      result = r.c_phone ? await sendWhatsApp(r.c_phone, customerSms(ctx)) : { status: "skipped", error: "No customer phone" }
    } else if (r.recipient === "customer" && r.channel === "sms") {
      result = r.c_phone ? await sendSms(r.c_phone, customerSms(ctx)) : { status: "skipped", error: "No customer phone" }
    } else if (r.recipient === "customer" && r.channel === "email") {
      const { subject, html } = customerEmail(ctx)
      result = r.c_email ? await sendEmail(r.c_email, subject, html) : { status: "skipped", error: "No customer email" }
    } else if (r.recipient === "pharmacist" && r.channel === "sms") {
      result = r.a_phone ? await sendSms(r.a_phone, pharmacistSms(ctx)) : { status: "skipped", error: "No pharmacist phone" }
    } else {
      result = { status: "skipped", error: "Unsupported channel/recipient" }
    }

    await mark(db, r.id, result.status, result.error)
    if (result.status === "sent") sent++
    else if (result.status === "failed") failed++
    else skipped++
  }

  return NextResponse.json({ processed: rows.length, sent, skipped, failed })
}

async function mark(db: ReturnType<typeof dbAdmin>, id: string, status: "sent" | "skipped" | "failed", error?: string) {
  await db.update(appointment_reminder)
    .set({ status, error: error ?? null, sent_at: status === "sent" ? new Date() : null })
    .where(eq(appointment_reminder.id, id))
}
