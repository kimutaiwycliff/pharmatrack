import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { sendSms } from "@/lib/notifications/sms"
import { sendEmail } from "@/lib/notifications/email"
import { customerSms, pharmacistSms, customerEmail, type MessageContext } from "@/lib/appointments/reminders"

// Runs on a schedule (Vercel Cron). Sends any due, pending reminders.
// Secured by CRON_SECRET (Vercel sends it as `Authorization: Bearer <secret>`).
export const dynamic = "force-dynamic"

interface ReminderRow {
  id: string
  channel: "sms" | "email"
  recipient: "customer" | "pharmacist"
  appointment: {
    scheduled_at: string
    service: string
    status: string
    customer: { full_name: string; phone: string | null; email: string | null; reminders_opt_in: boolean } | null
    branch: { name: string } | null
    organization: { name: string } | null
    assignee: { full_name: string; phone: string | null } | null
  } | null
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get("authorization")
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = createAdminClient()
  const nowIso = new Date().toISOString()

  const { data, error } = await supabase
    .from("appointment_reminders")
    .select(
      "id, channel, recipient, appointment:appointments(scheduled_at, service, status, customer:customers(full_name, phone, email, reminders_opt_in), branch:branches(name), organization:organizations(name), assignee:profiles!appointments_assigned_to_fkey(full_name, phone))",
    )
    .eq("status", "pending")
    .lte("send_at", nowIso)
    .limit(200)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data ?? []) as unknown as ReminderRow[]
  let sent = 0, skipped = 0, failed = 0

  for (const r of rows) {
    const appt = r.appointment
    // Appointment gone or no longer active → nothing to send.
    if (!appt || !["scheduled", "confirmed"].includes(appt.status)) {
      await mark(supabase, r.id, "skipped", "Appointment not active")
      skipped++
      continue
    }
    // Customer opted out of messaging after this was queued.
    if (appt.customer?.reminders_opt_in === false) {
      await mark(supabase, r.id, "skipped", "Customer opted out")
      skipped++
      continue
    }

    const ctx: MessageContext = {
      customerName: appt.customer?.full_name ?? "Customer",
      service: appt.service,
      scheduledAt: appt.scheduled_at,
      branchName: appt.branch?.name ?? "the pharmacy",
      orgName: appt.organization?.name ?? "PharmaTrack",
    }

    let result: { status: "sent" | "skipped" | "failed"; error?: string }
    if (r.recipient === "customer" && r.channel === "sms") {
      result = appt.customer?.phone
        ? await sendSms(appt.customer.phone, customerSms(ctx))
        : { status: "skipped", error: "No customer phone" }
    } else if (r.recipient === "customer" && r.channel === "email") {
      const { subject, html } = customerEmail(ctx)
      result = appt.customer?.email
        ? await sendEmail(appt.customer.email, subject, html)
        : { status: "skipped", error: "No customer email" }
    } else if (r.recipient === "pharmacist" && r.channel === "sms") {
      result = appt.assignee?.phone
        ? await sendSms(appt.assignee.phone, pharmacistSms(ctx))
        : { status: "skipped", error: "No pharmacist phone" }
    } else {
      result = { status: "skipped", error: "Unsupported channel/recipient" }
    }

    await mark(supabase, r.id, result.status, result.error)
    if (result.status === "sent") sent++
    else if (result.status === "failed") failed++
    else skipped++
  }

  return NextResponse.json({ processed: rows.length, sent, skipped, failed })
}

async function mark(
  supabase: ReturnType<typeof createAdminClient>,
  id: string,
  status: "sent" | "skipped" | "failed",
  error?: string,
) {
  await supabase
    .from("appointment_reminders")
    .update({ status, error: error ?? null, sent_at: status === "sent" ? new Date().toISOString() : null })
    .eq("id", id)
}
