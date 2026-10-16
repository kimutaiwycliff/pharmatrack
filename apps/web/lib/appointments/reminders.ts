import { serviceLabel } from "./services"
import type { OrgMessaging } from "@/lib/notifications/messaging"

const EAT_OFFSET_MS = 3 * 3_600_000 // Africa/Nairobi is UTC+3 (no DST)

type Channel = "sms" | "email" | "whatsapp"

export interface ReminderInsert {
  appointment_id: string
  organization_id: string
  channel: Channel
  recipient: "customer" | "pharmacist"
  send_at: string
  status: "pending"
}

interface BuildArgs {
  appointmentId: string
  organizationId: string
  scheduledAt: string | Date
  customer: { phone: string | null; email: string | null }
  pharmacistPhone: string | null
  /** This pharmacy's paid messaging add-ons (lib/notifications/messaging). */
  messaging: OrgMessaging
}

/**
 * The reminder cron runs once a day (Vercel free tier), so we queue a single
 * reminder per recipient/channel timed for ~06:00 EAT the day before the
 * appointment. If that moment is already past (e.g. booked the day before or
 * same day), it's set to "now" so it still goes out on the next daily run.
 * No reminder is created for an appointment that's already in the past.
 */
function reminderSendAt(scheduledAt: string | Date): number | null {
  const apptMs = new Date(scheduledAt).getTime()
  const now = Date.now()
  if (apptMs <= now) return null

  // Calendar day of the appointment in EAT, then the previous day at 06:00 EAT.
  const eat = new Date(apptMs + EAT_OFFSET_MS)
  const dayBefore06EatUtc = Date.UTC(
    eat.getUTCFullYear(),
    eat.getUTCMonth(),
    eat.getUTCDate() - 1,
    6,
    0,
    0,
  ) - EAT_OFFSET_MS

  let sendMs = dayBefore06EatUtc
  if (sendMs < now) sendMs = now      // booked late → send next run
  if (sendMs >= apptMs) sendMs = now  // never after the appointment
  return sendMs
}

export function buildReminders({
  appointmentId,
  organizationId,
  scheduledAt,
  customer,
  pharmacistPhone,
  messaging,
}: BuildArgs): ReminderInsert[] {
  const sendMs = reminderSendAt(scheduledAt)
  if (sendMs === null) return []
  const send_at = new Date(sendMs).toISOString()
  const rows: ReminderInsert[] = []

  const add = (channel: Channel, recipient: "customer" | "pharmacist") =>
    rows.push({ appointment_id: appointmentId, organization_id: organizationId, channel, recipient, send_at, status: "pending" })

  // Phone messages only when this pharmacy has paid for them: WhatsApp first
  // (richer + cheaper in Kenya), else SMS. Without either nothing is queued for
  // the phone — staff call the client instead (call list + morning email,
  // lib/appointments/call-list.ts), rather than piling up skipped rows.
  if (customer.phone) {
    if (messaging.whatsapp) add("whatsapp", "customer")
    else if (messaging.sms) add("sms", "customer")
  }
  if (customer.email) add("email", "customer")
  if (pharmacistPhone && messaging.sms) add("sms", "pharmacist")

  return rows
}

// ─── Message templates ───────────────────────────────────────
export function formatWhen(scheduledAt: string | Date): string {
  return new Intl.DateTimeFormat("en-KE", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Africa/Nairobi",
  }).format(new Date(scheduledAt))
}

export interface MessageContext {
  customerName: string
  service: string
  scheduledAt: string | Date
  branchName: string
  orgName: string
}

export function customerSms(ctx: MessageContext): string {
  return `Hi ${ctx.customerName.split(" ")[0]}, reminder: your ${serviceLabel(ctx.service)} appointment at ${ctx.branchName} is on ${formatWhen(ctx.scheduledAt)}. Reply to reschedule. — ${ctx.orgName}`
}

export function pharmacistSms(ctx: MessageContext): string {
  return `Appointment reminder: ${ctx.customerName} — ${serviceLabel(ctx.service)} at ${ctx.branchName}, ${formatWhen(ctx.scheduledAt)}.`
}

function escapeHtml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c] ?? c))
}

export function customerEmail(ctx: MessageContext): { subject: string; html: string } {
  return {
    subject: `Reminder: your ${serviceLabel(ctx.service)} appointment`,
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:480px">
        <h2 style="margin:0 0 12px">Appointment reminder</h2>
        <p>Hi ${escapeHtml(ctx.customerName)},</p>
        <p>This is a reminder of your <strong>${escapeHtml(serviceLabel(ctx.service))}</strong> appointment at
        <strong>${escapeHtml(ctx.branchName)}</strong>.</p>
        <p style="font-size:16px"><strong>${formatWhen(ctx.scheduledAt)}</strong></p>
        <p>If you need to reschedule, please contact us.</p>
        <p style="color:#6b7280">— ${escapeHtml(ctx.orgName)}</p>
      </div>`,
  }
}
