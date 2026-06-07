// Bookable services. `recurrenceWeeks` drives the "next dose" suggestion when a
// recurring appointment is completed (null = one-off, no auto next dose).
export interface AppointmentService {
  value: string
  label: string
  recurrenceWeeks: number | null
}

export const APPOINTMENT_SERVICES: AppointmentService[] = [
  { value: "family_planning_depo", label: "Family Planning — Depo-Provera", recurrenceWeeks: 13 },
  { value: "family_planning_sayana", label: "Family Planning — Sayana Press", recurrenceWeeks: 13 },
  { value: "family_planning_noristerat", label: "Family Planning — Noristerat (NET-EN)", recurrenceWeeks: 8 },
  { value: "family_planning_implant", label: "Family Planning — Implant review", recurrenceWeeks: null },
  { value: "vaccination", label: "Vaccination / Immunization", recurrenceWeeks: null },
  { value: "injection", label: "Injection (other)", recurrenceWeeks: null },
  { value: "wound_care", label: "Wound care / Dressing", recurrenceWeeks: null },
  { value: "bp_check", label: "Blood pressure / Sugar check", recurrenceWeeks: null },
  { value: "consultation", label: "Consultation", recurrenceWeeks: null },
  { value: "other", label: "Other", recurrenceWeeks: null },
]

const BY_VALUE = new Map(APPOINTMENT_SERVICES.map((s) => [s.value, s]))

export function serviceLabel(value: string): string {
  return BY_VALUE.get(value)?.label ?? value
}

export function serviceRecurrenceWeeks(value: string): number | null {
  return BY_VALUE.get(value)?.recurrenceWeeks ?? null
}
