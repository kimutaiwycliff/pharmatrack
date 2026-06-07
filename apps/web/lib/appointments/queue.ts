import type { createClient } from "@/lib/supabase/server"
import { buildReminders } from "./reminders"

type ServerClient = Awaited<ReturnType<typeof createClient>>

interface ApptForQueue {
  id: string
  scheduled_at: string
  assigned_to: string | null
  customer: { phone: string | null; email: string | null; reminders_opt_in?: boolean } | null
}

/** (Re)build the pending reminder rows for an appointment. */
export async function queueReminders(supabase: ServerClient, appt: ApptForQueue, orgId: string) {
  // Respect the customer's messaging opt-out (SMS costs money).
  if (appt.customer?.reminders_opt_in === false) return

  let pharmacistPhone: string | null = null
  if (appt.assigned_to) {
    const { data: p } = await supabase.from("profiles").select("phone").eq("id", appt.assigned_to).single()
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
    await supabase.from("appointment_reminders").insert(rows)
  }
}
