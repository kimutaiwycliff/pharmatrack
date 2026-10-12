// Shapes returned by the web API (and mirrored by the Offline Edition's local
// repos). Appointment = apps/web/lib/appointments/serialize.ts shapeAppt();
// Prescription = apps/web/lib/prescriptions/serialize.ts shape(). Dates are
// ISO strings over JSON.

export interface ApptCustomer {
  id: string
  full_name: string | null
  phone: string | null
  email: string | null
  reminders_opt_in: boolean | null
}

export interface Appointment {
  id: string
  branch_id: string | null
  customer_id: string
  service: string | null
  service_label: string | null
  scheduled_at: string
  duration_minutes: number
  status: string
  assigned_to: string | null
  notes: string | null
  next_due_date?: string | null
  customer: ApptCustomer | null
  assignee: { id: string; full_name: string | null } | null
}

/** apps/web/app/api/appointment-services/route.ts */
export interface ServiceOption {
  id: string
  slug: string
  label: string
  recurrence_weeks: number | null
}

/** apps/web/app/api/customers/route.ts (booking/prescribing autocomplete). */
export interface CustomerHit {
  id: string
  full_name: string
  phone: string | null
  email: string | null
  reminders_opt_in?: boolean | null
}

export interface PrescriptionItem {
  id?: string
  product_id?: string | null
  drug_name: string | null
  dose?: string | null
  frequency?: string | null
  duration?: string | null
  quantity?: number | null
  instructions?: string | null
}

export interface Prescription {
  id: string
  status: string
  created_at: string
  diagnosis: string | null
  prescriber_name?: string | null
  prescriber_reg_no?: string | null
  notes?: string | null
  customer: { id?: string; full_name: string | null; phone: string | null; allergies?: string | null } | null
  items: PrescriptionItem[]
}

/** packages/core DurWarning, loosened: the server may return "minor"/"major". */
export interface DurFinding {
  type: string
  severity: string
  message: string
}
