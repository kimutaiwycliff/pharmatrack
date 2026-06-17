import { eq } from "drizzle-orm"
import { appointment, customer, user, type DrizzleDB } from "@pharmatrack/db"

// Shapes an appointment for the API: the row + a small customer object + the
// assignee (pharmacist) name, matching what the UI expects.
export const apptCols = {
  appt: appointment,
  c_id: customer.id, c_name: customer.full_name, c_phone: customer.phone, c_email: customer.email, c_opt: customer.reminders_opt_in,
  a_id: user.id, a_name: user.name,
}

type ApptRow = {
  appt: typeof appointment.$inferSelect
  c_id: string | null; c_name: string | null; c_phone: string | null; c_email: string | null; c_opt: boolean | null
  a_id: string | null; a_name: string | null
}

export function shapeAppt(r: ApptRow) {
  return {
    ...r.appt,
    customer: r.c_id ? { id: r.c_id, full_name: r.c_name, phone: r.c_phone, email: r.c_email, reminders_opt_in: r.c_opt } : null,
    assignee: r.a_id ? { id: r.a_id, full_name: r.a_name } : null,
  }
}

export async function fetchAppointment(db: DrizzleDB, id: string) {
  const [r] = await db.select(apptCols).from(appointment)
    .leftJoin(customer, eq(customer.id, appointment.customer_id))
    .leftJoin(user, eq(user.id, appointment.assigned_to))
    .where(eq(appointment.id, id)).limit(1)
  return r ? shapeAppt(r) : null
}
