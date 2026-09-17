import { and, desc, eq, gte, lte, sql } from "drizzle-orm"
import * as Crypto from "expo-crypto"
import { checkDur, type DurWarning } from "@pharmatrack/core"
import { db } from "../db/database"
import { customers, appointments, appointmentServices, prescriptions, prescriptionItems, drugInteractions } from "../db/schema"
import { DUR_INTERACTIONS } from "../data/dur-interactions"

// ADR-014 — local repo for Appointments/Prescriptions. Return shapes match
// the online API field-for-field.

async function findOrCreateCustomer(fullName: string, phone?: string | null): Promise<string> {
  if (phone?.trim()) {
    const [existing] = await db.select().from(customers).where(eq(customers.phone, phone.trim())).limit(1)
    if (existing) return existing.id
  }
  const id = Crypto.randomUUID()
  await db.insert(customers).values({ id, fullName, phone: phone?.trim() || null, remindersOptIn: true, createdAt: Date.now() })
  return id
}

// Seeded once, lazily, the first time DUR actually runs — see
// data/dur-interactions.ts for the dataset and why it's authored locally
// rather than ported from an online table (the online table has no seed
// data of its own to port). Still a starter safety net, not a licensed
// interaction-checker database — a known, tracked scope limit.
async function ensureDurSeed(): Promise<void> {
  const [row] = await db.select({ n: sql<number>`count(*)` }).from(drugInteractions)
  if ((row?.n ?? 0) > 0) return
  for (const r of DUR_INTERACTIONS) {
    await db.insert(drugInteractions).values({ id: Crypto.randomUUID(), drugA: r.a, drugB: r.b, severity: r.severity, note: r.note })
  }
}

export async function runLocalDur(customerId: string, newDrugNames: string[]): Promise<DurWarning[]> {
  await ensureDurSeed()
  const [customer] = await db.select({ allergies: customers.allergies }).from(customers).where(eq(customers.id, customerId)).limit(1)
  const activeRx = await db.select({ id: prescriptions.id }).from(prescriptions).where(and(eq(prescriptions.customerId, customerId), eq(prescriptions.status, "active")))
  let activeDrugNames: string[] = []
  if (activeRx.length > 0) {
    const items = await db.select({ drugName: prescriptionItems.drugName }).from(prescriptionItems)
    activeDrugNames = items.map((i) => i.drugName ?? "").filter(Boolean)
  }
  const interactionRows = await db.select().from(drugInteractions)
  return checkDur(
    newDrugNames,
    customer?.allergies,
    activeDrugNames,
    interactionRows.map((r) => ({ drugA: r.drugA, drugB: r.drugB, severity: r.severity, note: r.note })),
  )
}

// ── Appointments ─────────────────────────────────────────────────────────

export async function ensureDefaultAppointmentServices(): Promise<void> {
  const [row] = await db.select({ n: sql<number>`count(*)` }).from(appointmentServices)
  if ((row?.n ?? 0) > 0) return
  const defaults = [
    { slug: "consultation", label: "Consultation", recurrenceWeeks: null as number | null, sortOrder: 0 },
    { slug: "vaccination", label: "Vaccination", recurrenceWeeks: null as number | null, sortOrder: 1 },
    { slug: "depo-provera", label: "Depo-Provera injection", recurrenceWeeks: 12, sortOrder: 2 },
    { slug: "bp-check", label: "Blood pressure check", recurrenceWeeks: 4, sortOrder: 3 },
  ]
  for (const d of defaults) {
    await db.insert(appointmentServices).values({ id: Crypto.randomUUID(), slug: d.slug, label: d.label, recurrenceWeeks: d.recurrenceWeeks, isActive: true, sortOrder: d.sortOrder })
  }
}

export async function listLocalAppointmentServices() {
  await ensureDefaultAppointmentServices()
  const rows = await db.select().from(appointmentServices).where(eq(appointmentServices.isActive, true))
  return { services: rows.map((r) => ({ id: r.id, slug: r.slug, label: r.label, recurrence_weeks: r.recurrenceWeeks })) }
}

export async function listLocalAppointments(opts: { branchId: string; from: string; to: string; status: string; q?: string }) {
  const clauses = [gte(appointments.scheduledAt, new Date(opts.from).getTime()), lte(appointments.scheduledAt, new Date(opts.to).getTime())]
  if (opts.status !== "all") clauses.push(eq(appointments.status, opts.status))
  const rows = await db.select().from(appointments).where(and(...clauses)).orderBy(appointments.scheduledAt)

  const result = []
  for (const a of rows) {
    const [customer] = await db.select().from(customers).where(eq(customers.id, a.customerId)).limit(1)
    if (opts.q && opts.q.trim().length >= 2) {
      const q = opts.q.toLowerCase()
      if (!customer?.fullName.toLowerCase().includes(q) && !customer?.phone?.includes(opts.q)) continue
    }
    result.push({
      id: a.id, branch_id: a.branchId, customer_id: a.customerId, service: a.serviceId, service_label: a.serviceLabel,
      scheduled_at: new Date(a.scheduledAt).toISOString(), duration_minutes: a.durationMinutes, status: a.status,
      assigned_to: a.assignedTo, notes: a.notes,
      customer: customer ? { id: customer.id, full_name: customer.fullName, phone: customer.phone, email: customer.email, reminders_opt_in: customer.remindersOptIn } : null,
      assignee: null,
    })
  }
  return { appointments: result }
}

export async function createLocalAppointment(input: {
  customerName: string; customerPhone?: string | null; branchId: string
  service: string | null; serviceLabel?: string | null; scheduledAt: string; notes?: string | null
}): Promise<void> {
  const customerId = await findOrCreateCustomer(input.customerName, input.customerPhone)
  await db.insert(appointments).values({
    id: Crypto.randomUUID(), branchId: input.branchId, customerId, serviceId: null,
    serviceLabel: input.serviceLabel ?? input.service ?? null,
    scheduledAt: new Date(input.scheduledAt).getTime(), durationMinutes: 15,
    status: "scheduled", assignedTo: null, notes: input.notes ?? null, createdAt: Date.now(),
  })
}

// ── Prescriptions ────────────────────────────────────────────────────────

export async function listLocalPrescriptions() {
  const rows = await db.select().from(prescriptions).orderBy(desc(prescriptions.createdAt))
  const result = []
  for (const p of rows) {
    const [customer] = p.customerId ? await db.select().from(customers).where(eq(customers.id, p.customerId)).limit(1) : [null]
    const items = await db.select({ drugName: prescriptionItems.drugName }).from(prescriptionItems).where(eq(prescriptionItems.prescriptionId, p.id))
    result.push({
      id: p.id, status: p.status, created_at: new Date(p.createdAt).toISOString(), diagnosis: p.diagnosis,
      customer: customer ? { full_name: customer.fullName, phone: customer.phone } : null,
      items: items.map((i) => ({ drug_name: i.drugName ?? "" })),
    })
  }
  return { prescriptions: result }
}

export interface PrescriptionItemInput { drug_name: string; dose?: string; frequency?: string; duration?: string; quantity?: number; instructions?: string }

export async function createLocalPrescription(input: {
  customerName: string; customerPhone?: string | null; prescriberName?: string | null
  diagnosis?: string | null; items: PrescriptionItemInput[]; confirm: boolean
}): Promise<{ requiresConfirmation: true; warnings: DurWarning[] } | { requiresConfirmation: false }> {
  const customerId = await findOrCreateCustomer(input.customerName, input.customerPhone)

  if (!input.confirm) {
    const warnings = await runLocalDur(customerId, input.items.map((i) => i.drug_name))
    if (warnings.some((w) => w.severity === "severe")) {
      return { requiresConfirmation: true, warnings }
    }
  }

  const prescriptionId = Crypto.randomUUID()
  await db.insert(prescriptions).values({
    id: prescriptionId, customerId, prescriberName: input.prescriberName ?? null,
    diagnosis: input.diagnosis ?? null, status: "active", createdAt: Date.now(),
  })
  for (const item of input.items) {
    await db.insert(prescriptionItems).values({
      id: Crypto.randomUUID(), prescriptionId, drugName: item.drug_name, dose: item.dose ?? null,
      frequency: item.frequency ?? null, duration: item.duration ?? null,
      quantity: item.quantity ?? null, instructions: item.instructions ?? null,
    })
  }
  return { requiresConfirmation: false }
}
