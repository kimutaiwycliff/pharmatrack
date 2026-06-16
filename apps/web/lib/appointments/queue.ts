import { eq } from "drizzle-orm"
import { staff_profile, appointment_reminder, type DrizzleDB } from "@pharmatrack/db"
import { buildReminders } from "./reminders"

interface ApptForQueue {
  id: string
  scheduled_at: string
  assigned_to: string | null
  customer: { phone: string | null; email: string | null; reminders_opt_in?: boolean | null } | null
}

/** (Re)build the pending reminder rows for an appointment, inside a tenant tx. */
export async function queueReminders(db: DrizzleDB, appt: ApptForQueue, orgId: string) {
  // Respect the customer's messaging opt-out (SMS costs money).
  if (appt.customer?.reminders_opt_in === false) return

  let pharmacistPhone: string | null = null
  if (appt.assigned_to) {
    const [p] = await db.select({ phone: staff_profile.phone }).from(staff_profile).where(eq(staff_profile.user_id, appt.assigned_to)).limit(1)
    pharmacistPhone = p?.phone ?? null
  }

  const rows = buildReminders({
    appointmentId: appt.id,
    organizationId: orgId,
    scheduledAt: appt.scheduled_at,
    customer: { phone: appt.customer?.phone ?? null, email: appt.customer?.email ?? null },
    pharmacistPhone,
  })
  if (rows.length > 0) {
    await db.insert(appointment_reminder).values(rows.map((r) => ({
      appointment_id: r.appointment_id, organization_id: r.organization_id,
      channel: r.channel, recipient: r.recipient, send_at: new Date(r.send_at), status: r.status,
    })))
  }
}
