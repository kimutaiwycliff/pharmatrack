import { ApiError, apiJson, withQuery } from "../../lib/api"
import { env } from "../../lib/env"
import {
  createLocalAppointment, createLocalPrescription, listLocalAppointmentServices, listLocalAppointments,
} from "../../repo/clinical"
import type { AppointmentRange, StatusFilter } from "./logic/appointments"
import { rangeBounds } from "./logic/appointments"
import type { PrescriptionItemPayload } from "./logic/prescriptions"
import {
  getLocalCustomerClinical, listLocalPrescriptionsFull, searchLocalCustomers, setLocalPrescriptionStatus, updateLocalAppointment,
} from "./localRepo"
import type { Appointment, CustomerHit, DurFinding, Prescription, ServiceOption } from "./types"

// One data layer for the clinical screens: every function picks the web API
// (field names read from apps/web/app/api/{appointments,appointment-services,
// customers,prescriptions}/**) or, in the Offline Edition, the local repos.
// Screens never call apiJson directly, so the Offline Edition can't hit it.

const OFFLINE = env.EXPO_PUBLIC_OFFLINE_MODE

/** A plan without the feature answers 403 { code: "feature_locked" } (lib/entitlements). */
export function isFeatureLocked(err: unknown): boolean {
  return err instanceof ApiError && err.status === 403 && (err.body as { code?: string } | null)?.code === "feature_locked"
}

export type Locked = { locked: true }

// ── Appointments ────────────────────────────────────────────────────────────

export interface ApptQuery {
  range: AppointmentRange
  status: StatusFilter
  q: string
  /** undefined = all branches (branches.all users). */
  branchId: string | undefined
}

export async function fetchAppointments(p: ApptQuery): Promise<Appointment[] | Locked> {
  const { from, to } = rangeBounds(p.range)
  const q = p.q.trim().length >= 2 ? p.q.trim() : undefined
  if (OFFLINE) {
    const res = await listLocalAppointments({
      branchId: p.branchId ?? "",
      from: from ?? new Date(0).toISOString(),
      to: to ?? new Date(Date.UTC(2100, 0, 1)).toISOString(),
      status: p.status,
      q,
    })
    return res.appointments
  }
  try {
    const res = await apiJson<{ appointments: Appointment[] }>(
      withQuery("/api/appointments", { from, to, status: p.status, branch_id: p.branchId, q }),
    )
    return res.appointments
  } catch (err) {
    if (isFeatureLocked(err)) return { locked: true }
    throw err
  }
}

export async function fetchServices(): Promise<ServiceOption[]> {
  if (OFFLINE) return (await listLocalAppointmentServices()).services
  return (await apiJson<{ services: ServiceOption[] }>("/api/appointment-services")).services
}

export interface BookingPayload {
  customer_id?: string
  customer_name: string
  customer_phone?: string
  customer_email?: string
  branch_id: string
  service: string
  service_label?: string
  scheduled_at: string
  duration_minutes: number
  notes?: string
  parent_appointment_id?: string
  reminders_opt_in: boolean
}

export async function createAppointment(b: BookingPayload): Promise<void> {
  if (OFFLINE) {
    // The local repo has no reminders/email/duration (no messaging offline).
    await createLocalAppointment({
      customerName: b.customer_name, customerPhone: b.customer_phone ?? null, branchId: b.branch_id,
      service: b.service, serviceLabel: b.service_label, scheduledAt: b.scheduled_at, notes: b.notes ?? null,
    })
    return
  }
  await apiJson("/api/appointments", { method: "POST", body: b })
}

export interface ApptPatch {
  status?: string
  scheduled_at?: string
  duration_minutes?: number
  notes?: string | null
}

/**
 * PATCH /api/appointments/[id] → nextDue (ISO) when a recurring service is
 * completed. The service isn't editable here: web's PATCH would change the
 * slug but leave the stored service_label behind.
 */
export async function updateAppointment(id: string, patch: ApptPatch): Promise<{ nextDue: string | null }> {
  if (OFFLINE) return updateLocalAppointment(id, patch)
  const res = await apiJson<{ nextDue?: string | null }>(`/api/appointments/${id}`, { method: "PATCH", body: patch })
  return { nextDue: res.nextDue ?? null }
}

// ── Customers ───────────────────────────────────────────────────────────────

export async function searchCustomers(q: string): Promise<CustomerHit[]> {
  if (OFFLINE) return searchLocalCustomers(q)
  return (await apiJson<{ customers: CustomerHit[] }>(withQuery("/api/customers", { q }))).customers
}

/** Allergies + active medication for the DUR preview (GET /api/customers/[id]). */
export async function fetchCustomerClinical(id: string): Promise<{ allergies: string | null; activeDrugs: string[] }> {
  if (OFFLINE) return getLocalCustomerClinical(id)
  const res = await apiJson<{
    customer: { allergies: string | null }
    prescriptions: { status: string; items: { drug_name: string | null }[] }[]
  }>(`/api/customers/${id}`)
  const activeDrugs = res.prescriptions
    .filter((p) => p.status === "active")
    .flatMap((p) => p.items.map((i) => i.drug_name ?? ""))
    .filter(Boolean)
  return { allergies: res.customer.allergies ?? null, activeDrugs }
}

// ── Prescriptions ───────────────────────────────────────────────────────────

export async function fetchPrescriptions(status: string): Promise<Prescription[] | Locked> {
  if (OFFLINE) return listLocalPrescriptionsFull(status)
  try {
    return (await apiJson<{ prescriptions: Prescription[] }>(withQuery("/api/prescriptions", { status }))).prescriptions
  } catch (err) {
    if (isFeatureLocked(err)) return { locked: true }
    throw err
  }
}

export interface PrescriptionPayload {
  customer_id?: string
  customer_name: string
  customer_phone?: string
  prescriber_name?: string
  prescriber_reg_no?: string
  diagnosis?: string
  items: PrescriptionItemPayload[]
}

export type CreateRxResult = { kind: "confirm"; warnings: DurFinding[] } | { kind: "saved"; warnings: DurFinding[] }

/**
 * POST /api/prescriptions. A severe DUR finding answers 409 { requiresConfirmation,
 * warnings }; resubmitting the same body with confirm: true saves anyway (web's
 * "Prescribe anyway").
 */
export async function createPrescription(p: PrescriptionPayload, confirm: boolean): Promise<CreateRxResult> {
  if (OFFLINE) {
    const res = await createLocalPrescription({
      customerName: p.customer_name, customerPhone: p.customer_phone ?? null, prescriberName: p.prescriber_name ?? null,
      diagnosis: p.diagnosis ?? null,
      items: p.items.map((i) => ({
        drug_name: i.drug_name, dose: i.dose, frequency: i.frequency, duration: i.duration, quantity: i.quantity ?? undefined, instructions: i.instructions,
      })),
      confirm,
    })
    return res.requiresConfirmation ? { kind: "confirm", warnings: res.warnings } : { kind: "saved", warnings: [] }
  }
  try {
    const res = await apiJson<{ warnings?: DurFinding[] }>("/api/prescriptions", { method: "POST", body: { ...p, confirm } })
    return { kind: "saved", warnings: res.warnings ?? [] }
  } catch (err) {
    const body = err instanceof ApiError ? (err.body as { requiresConfirmation?: boolean; warnings?: DurFinding[] } | null) : null
    if (err instanceof ApiError && err.status === 409 && body?.requiresConfirmation) return { kind: "confirm", warnings: body.warnings ?? [] }
    throw err
  }
}

export async function setPrescriptionStatus(id: string, status: "active" | "completed" | "cancelled"): Promise<void> {
  if (OFFLINE) return setLocalPrescriptionStatus(id, status)
  await apiJson(`/api/prescriptions/${id}`, { method: "PATCH", body: { status } })
}
