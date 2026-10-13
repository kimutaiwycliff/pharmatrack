import { and, asc, desc, eq, inArray, like, or } from "drizzle-orm"
import { db } from "../../db/database"
import { appointmentServices, appointments, customers, prescriptionItems, prescriptions } from "../../db/schema"
import type { CustomerHit, Prescription } from "./types"
import { UserFacingError } from "../../lib/errors"

// Offline Edition only (ADR-014): local reads/writes the clinical screens need
// beyond src/repo/clinical.ts — customer search, a full prescription list (with
// item details for the detail sheet), and status / reschedule updates. Return
// shapes match the online API so the screens never branch on shape.

export async function searchLocalCustomers(q: string): Promise<CustomerHit[]> {
  const term = `%${q.trim()}%`
  const rows = await db
    .select()
    .from(customers)
    .where(q.trim() ? or(like(customers.fullName, term), like(customers.phone, term)) : undefined)
    .orderBy(asc(customers.fullName))
    .limit(10)
  return rows.map((c) => ({ id: c.id, full_name: c.fullName, phone: c.phone, email: c.email, reminders_opt_in: c.remindersOptIn }))
}

/** Allergies + this patient's active medication, for the DUR preview. */
export async function getLocalCustomerClinical(customerId: string): Promise<{ allergies: string | null; activeDrugs: string[] }> {
  const [c] = await db.select({ allergies: customers.allergies }).from(customers).where(eq(customers.id, customerId)).limit(1)
  const rx = await db
    .select({ id: prescriptions.id })
    .from(prescriptions)
    .where(and(eq(prescriptions.customerId, customerId), eq(prescriptions.status, "active")))
  const ids = rx.map((r) => r.id)
  const items = ids.length
    ? await db.select({ drugName: prescriptionItems.drugName }).from(prescriptionItems).where(inArray(prescriptionItems.prescriptionId, ids))
    : []
  return { allergies: c?.allergies ?? null, activeDrugs: items.map((i) => i.drugName ?? "").filter(Boolean) }
}

export async function listLocalPrescriptionsFull(status: string): Promise<Prescription[]> {
  const rows = await db
    .select()
    .from(prescriptions)
    .where(status !== "all" ? eq(prescriptions.status, status) : undefined)
    .orderBy(desc(prescriptions.createdAt))
    .limit(200)
  const ids = rows.map((r) => r.id)
  const items = ids.length ? await db.select().from(prescriptionItems).where(inArray(prescriptionItems.prescriptionId, ids)) : []
  const custIds = [...new Set(rows.map((r) => r.customerId).filter((v): v is string => !!v))]
  const custs = custIds.length ? await db.select().from(customers).where(inArray(customers.id, custIds)) : []
  const byCust = new Map(custs.map((c) => [c.id, c]))
  return rows.map((p) => {
    const c = p.customerId ? byCust.get(p.customerId) : undefined
    return {
      id: p.id,
      status: p.status,
      created_at: new Date(p.createdAt).toISOString(),
      diagnosis: p.diagnosis,
      prescriber_name: p.prescriberName,
      prescriber_reg_no: p.prescriberRegNo,
      notes: p.notes,
      customer: c ? { id: c.id, full_name: c.fullName, phone: c.phone, allergies: c.allergies } : null,
      items: items
        .filter((i) => i.prescriptionId === p.id)
        .map((i) => ({
          id: i.id, drug_name: i.drugName, dose: i.dose, frequency: i.frequency, duration: i.duration, quantity: i.quantity, instructions: i.instructions,
        })),
    }
  })
}

export async function setLocalPrescriptionStatus(id: string, status: string): Promise<void> {
  await db.update(prescriptions).set({ status }).where(eq(prescriptions.id, id))
}

export interface LocalApptPatch {
  status?: string
  scheduled_at?: string
  duration_minutes?: number
  notes?: string | null
}

/**
 * Mirrors PATCH /api/appointments/[id]: completing a recurring service stores
 * and returns the next-dose date. Local rows keep only the service label, so
 * the recurrence is looked up by label.
 */
export async function updateLocalAppointment(id: string, patch: LocalApptPatch): Promise<{ nextDue: string | null }> {
  const [existing] = await db.select().from(appointments).where(eq(appointments.id, id)).limit(1)
  if (!existing) throw new UserFacingError("That appointment no longer exists. Go back and refresh.")
  await db
    .update(appointments)
    .set({
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.scheduled_at ? { scheduledAt: new Date(patch.scheduled_at).getTime() } : {}),
      ...(patch.duration_minutes ? { durationMinutes: patch.duration_minutes } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
    })
    .where(eq(appointments.id, id))

  if (patch.status !== "completed" || !existing.serviceLabel) return { nextDue: null }
  const [svc] = await db
    .select({ weeks: appointmentServices.recurrenceWeeks })
    .from(appointmentServices)
    .where(eq(appointmentServices.label, existing.serviceLabel))
    .limit(1)
  if (!svc?.weeks) return { nextDue: null }
  const next = new Date(existing.scheduledAt + svc.weeks * 7 * 86_400_000)
  const nextDue = next.toISOString()
  await db.update(appointments).set({ nextDueDate: nextDue.slice(0, 10) }).where(eq(appointments.id, id))
  return { nextDue }
}
