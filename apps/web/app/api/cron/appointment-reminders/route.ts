import { NextRequest, NextResponse } from "next/server"
import { and, eq, gte, inArray, lt, lte } from "drizzle-orm"
import { dbAdmin, appointment_reminder, appointment, customer, branch, organization, user, staff_profile, reminder_digest } from "@pharmatrack/db"
import { sendSms } from "@/lib/notifications/sms"
import { sendEmail } from "@/lib/notifications/email"
import { sendWhatsApp } from "@/lib/notifications/whatsapp"
import { orgMessaging, type OrgMessaging } from "@/lib/notifications/messaging"
import { customerSms, pharmacistSms, customerEmail, type MessageContext } from "@/lib/appointments/reminders"
import { callWindow, digestRecipients, nairobiHour, nairobiYmd, staffDigestEmail, type CallItem, type Manager } from "@/lib/appointments/call-list"

// Runs hourly (apps/worker). Sends any due, pending reminders, then — from
// 06:00 Nairobi — each staff member's once-a-day "clients to call" email.
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
    org_id: appointment_reminder.organization_id,
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
  // Paid add-ons per pharmacy (checked again at send time: one switched off
  // since queueing gets no more SMS/WhatsApp).
  const messagingCache = new Map<string, OrgMessaging>()
  const messagingOf = async (orgId: string) => {
    if (!messagingCache.has(orgId)) messagingCache.set(orgId, await orgMessaging(orgId))
    return messagingCache.get(orgId)!
  }

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
    const m = await messagingOf(r.org_id)
    if ((r.channel === "sms" && !m.sms) || (r.channel === "whatsapp" && !m.whatsapp)) {
      result = { status: "skipped", error: `${r.channel === "sms" ? "SMS" : "WhatsApp"} not activated for this pharmacy` }
    } else if (r.recipient === "customer" && r.channel === "whatsapp") {
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

  const digests = await sendMorningDigests(db)
  return NextResponse.json({ processed: rows.length, sent, skipped, failed, digests })
}

/**
 * Morning email (no-SMS reminders): tomorrow's clients to call plus today's
 * appointments, to the assigned staff member — unassigned appointments go to
 * the owner and managers. Once per person per Nairobi day (reminder_digest).
 */
async function sendMorningDigests(db: ReturnType<typeof dbAdmin>) {
  if (nairobiHour() < 6) return { sent: 0, note: "before 06:00 Nairobi" }
  const w = callWindow()
  const rows = await db.select({
    id: appointment.id, organization_id: appointment.organization_id, branch_id: appointment.branch_id,
    scheduled_at: appointment.scheduled_at, status: appointment.status, contact_outcome: appointment.contact_outcome,
    service: appointment.service, service_label: appointment.service_label, assigned_to: appointment.assigned_to,
    c_name: customer.full_name, c_phone: customer.phone, c_opt: customer.reminders_opt_in,
    branch_name: branch.name,
  }).from(appointment)
    .leftJoin(customer, eq(customer.id, appointment.customer_id))
    .leftJoin(branch, eq(branch.id, appointment.branch_id))
    .where(and(gte(appointment.scheduled_at, w.start), lt(appointment.scheduled_at, w.end), inArray(appointment.status, ["scheduled", "confirmed"])))
  if (rows.length === 0) return { sent: 0 }

  const day = new Map<string, string>()
  const items: CallItem[] = rows
    .filter((r) => r.c_opt !== false) // opted out of reminders → not called either
    .map((r) => {
      day.set(r.id, nairobiYmd(r.scheduled_at))
      return {
        id: r.id, organizationId: r.organization_id, branchId: r.branch_id, scheduledAt: r.scheduled_at,
        customerName: r.c_name ?? "Customer", customerPhone: r.c_phone ?? null,
        service: r.service_label ?? r.service, branchName: r.branch_name ?? null, assignedTo: r.assigned_to,
      }
    })
  // Tomorrow's list = still to be called (not confirmed, no call logged yet).
  const needsCall = new Set(rows.filter((r) => r.status === "scheduled" && !r.contact_outcome).map((r) => r.id))

  const orgIds = [...new Set(items.map((i) => i.organizationId))]
  if (orgIds.length === 0) return { sent: 0 }
  const mgrRows = await db.select({ userId: staff_profile.user_id, organizationId: staff_profile.organization_id, branchId: staff_profile.branch_id, role: staff_profile.role })
    .from(staff_profile)
    .where(and(inArray(staff_profile.organization_id, orgIds), inArray(staff_profile.role, ["owner", "manager"]), eq(staff_profile.is_active, true)))
  const managers: Manager[] = mgrRows.map((m) => ({ organizationId: m.organizationId, userId: m.userId, branchId: m.role === "owner" ? null : m.branchId }))

  const groups = digestRecipients(items, managers)
  const done = await db.select({ org: reminder_digest.organization_id, user: reminder_digest.user_id })
    .from(reminder_digest).where(and(inArray(reminder_digest.organization_id, orgIds), eq(reminder_digest.digest_date, w.today)))
  const doneKeys = new Set(done.map((d) => `${d.org}:${d.user}`))
  const userIds = [...new Set([...groups.keys()].map((k) => k.slice(k.indexOf(":") + 1)))]
  const people = userIds.length
    ? await db.select({ id: user.id, name: user.name, email: user.email }).from(user).where(inArray(user.id, userIds))
    : []
  const personById = new Map(people.map((p) => [p.id, p]))
  const orgs = await db.select({ id: organization.id, name: organization.name }).from(organization).where(inArray(organization.id, orgIds))
  const orgName = new Map(orgs.map((o) => [o.id, o.name]))
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://pharmatrack.co.ke"

  let sentCount = 0
  for (const [key, list] of groups) {
    if (doneKeys.has(key)) continue
    const orgId = key.slice(0, key.indexOf(":"))
    const person = personById.get(key.slice(key.indexOf(":") + 1))
    if (!person) continue
    const today = list.filter((i) => day.get(i.id) === w.today)
    const tomorrow = list.filter((i) => day.get(i.id) === w.tomorrow && needsCall.has(i.id))
    if (today.length === 0 && tomorrow.length === 0) continue
    const { subject, html } = staffDigestEmail({
      recipientName: person.name || person.email, orgName: orgName.get(orgId) ?? "your pharmacy", today, tomorrow, appUrl,
    })
    const result = await sendEmail(person.email, subject, html)
    // Recorded even when skipped (email not configured) so it isn't retried
    // every hour; a failed send is left unrecorded to retry next hour.
    if (result.status !== "failed") {
      await db.insert(reminder_digest).values({
        organization_id: orgId, user_id: person.id, digest_date: w.today,
        appointment_count: today.length + tomorrow.length, email_status: result.status,
      }).onConflictDoNothing()
    }
    if (result.status === "sent") sentCount++
  }
  return { sent: sentCount }
}

async function mark(db: ReturnType<typeof dbAdmin>, id: string, status: "sent" | "skipped" | "failed", error?: string) {
  await db.update(appointment_reminder)
    .set({ status, error: error ?? null, sent_at: status === "sent" ? new Date() : null })
    .where(eq(appointment_reminder.id, id))
}
