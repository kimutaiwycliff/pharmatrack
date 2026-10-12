import { checkDur, type DurWarning } from "@pharmatrack/core"
import { DUR_INTERACTIONS } from "../../../data/dur-interactions"
import type { BadgeKind } from "./appointments"

// Pure prescription helpers: form validation that mirrors the Zod schema in
// apps/web/app/api/prescriptions/route.ts, the item payload it accepts, the
// on-device DUR preview, and severity → badge colours (web's SEV_STYLES in
// components/prescriptions/NewPrescriptionDialog.tsx). No RN imports.

export type PrescriptionStatus = "active" | "completed" | "cancelled"

export const RX_TABS: { key: "active" | "completed" | "all"; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "completed", label: "Completed" },
  { key: "all", label: "All" },
]

export function rxStatusBadge(status: string): { status: BadgeKind; label: string } {
  if (status === "active") return { status: "ok", label: "Active" }
  if (status === "cancelled") return { status: "danger", label: "Cancelled" }
  return { status: "neutral", label: "Completed" }
}

export interface DrugLine {
  /** Stable key for React lists (lines can be removed from the middle). */
  key: string
  product_id: string | null
  drug_name: string
  dose: string
  frequency: string
  duration: string
  quantity: string
  instructions: string
}

export function emptyLine(key: string): DrugLine {
  return { key, product_id: null, drug_name: "", dose: "", frequency: "", duration: "", quantity: "", instructions: "" }
}

const lineIsBlank = (l: DrugLine) => !l.drug_name.trim() && !l.dose.trim() && !l.frequency.trim() && !l.duration.trim() && !l.quantity.trim() && !l.instructions.trim()

/** "Amoxicillin" + "500mg" → "Amoxicillin 500mg" (unless the name already carries the strength). */
export function drugLabel(name: string, strength: string | null | undefined): string {
  const n = name.trim()
  const s = strength?.trim()
  if (!s || n.toLowerCase().includes(s.toLowerCase())) return n
  return `${n} ${s}`
}

export interface PrescriptionItemPayload {
  product_id?: string | null
  drug_name: string
  dose?: string
  frequency?: string
  duration?: string
  quantity?: number | null
  instructions?: string
}

export interface RxFormInput {
  patientName: string
  phone: string
  prescriberName: string
  prescriberRegNo: string
  diagnosis: string
  lines: DrugLine[]
}

export interface RxFormErrors {
  patientName?: string
  phone?: string
  prescriberName?: string
  prescriberRegNo?: string
  diagnosis?: string
  /** Form-level: no drug at all. */
  items?: string
  lines: Record<string, Partial<Record<"drug_name" | "dose" | "frequency" | "duration" | "quantity" | "instructions", string>>>
}

const tooLong = (v: string, max: number) => (v.trim().length > max ? `Keep this under ${max} characters` : undefined)

/** Validates the form and builds the API items (blank lines are dropped). */
export function validatePrescription(input: RxFormInput): { errors: RxFormErrors; items: PrescriptionItemPayload[]; valid: boolean } {
  const errors: RxFormErrors = { lines: {} }
  const name = input.patientName.trim()
  if (!name) errors.patientName = "Patient name is required"
  else if (name.length > 120) errors.patientName = "Keep the name under 120 characters"
  const phone = input.phone.trim()
  if (phone) {
    const digits = phone.replace(/\D/g, "").length
    if (digits < 9 || digits > 15 || phone.length > 40) errors.phone = "Enter a valid phone number, e.g. 0712 345 678"
  }
  errors.prescriberName = tooLong(input.prescriberName, 120)
  errors.prescriberRegNo = tooLong(input.prescriberRegNo, 60)
  errors.diagnosis = tooLong(input.diagnosis, 300)

  const items: PrescriptionItemPayload[] = []
  for (const l of input.lines) {
    if (lineIsBlank(l)) continue
    const le: RxFormErrors["lines"][string] = {}
    const drug = l.drug_name.trim()
    if (!drug) le.drug_name = "Enter the drug, or remove this line"
    le.dose = tooLong(l.dose, 80)
    le.frequency = tooLong(l.frequency, 80)
    le.duration = tooLong(l.duration, 80)
    le.instructions = tooLong(l.instructions, 300)
    const q = l.quantity.trim()
    let quantity: number | null = null
    if (q) {
      if (!/^\d+$/.test(q) || Number(q) < 1) le.quantity = "Whole number, 1 or more"
      else quantity = Number(q)
    }
    if (Object.values(le).some(Boolean)) {
      errors.lines[l.key] = le
      continue
    }
    items.push({
      product_id: l.product_id,
      drug_name: drug,
      dose: l.dose.trim() || undefined,
      frequency: l.frequency.trim() || undefined,
      duration: l.duration.trim() || undefined,
      quantity,
      instructions: l.instructions.trim() || undefined,
    })
  }
  const lineErrors = Object.keys(errors.lines).length > 0
  if (items.length === 0 && !lineErrors) errors.items = "Add at least one drug"
  const valid =
    !lineErrors && items.length > 0 && !errors.patientName && !errors.phone && !errors.prescriberName && !errors.prescriberRegNo && !errors.diagnosis
  return { errors, items, valid }
}

// ── DUR (Drug Utilization Review) ──────────────────────────────────────────

const SEVERITY_RANK: Record<string, number> = { severe: 0, contraindicated: 0, major: 0, moderate: 1, mild: 2, minor: 2 }

/** Severity → badge colour + label. Unknown severities read as moderate (amber), like web's fallback. */
export function durBadge(severity: string): { status: BadgeKind; label: string } {
  const rank = SEVERITY_RANK[severity] ?? 1
  if (rank === 0) return { status: "danger", label: "Severe" }
  if (rank === 1) return { status: "warning", label: "Moderate" }
  return { status: "neutral", label: severity === "minor" ? "Minor" : "Mild" }
}

export const DUR_TYPE_LABEL: Record<string, string> = { allergy: "Allergy", duplicate: "Duplicate", interaction: "Interaction" }

export function sortWarnings<T extends { severity: string }>(warnings: T[]): T[] {
  return [...warnings].sort((a, b) => (SEVERITY_RANK[a.severity] ?? 1) - (SEVERITY_RANK[b.severity] ?? 1))
}

export const hasSevere = (warnings: { severity: string }[]) => warnings.some((w) => (SEVERITY_RANK[w.severity] ?? 1) === 0)

const BUNDLED_INTERACTIONS = DUR_INTERACTIONS.map((r) => ({ drugA: r.a, drugB: r.b, severity: r.severity, note: r.note }))

/**
 * On-device DUR preview while the form is filled in, so the pharmacist sees
 * allergy / duplicate / interaction findings before pressing Save — works
 * with no connection. Uses packages/core's checkDur (the same matcher the
 * server runs) over the bundled interaction list. The server's check on save
 * stays the authority: a severe finding there still asks for confirmation.
 */
export function previewDur(drugNames: string[], allergies: string | null | undefined, activeDrugNames: string[]): DurWarning[] {
  const names = drugNames.map((n) => n.trim()).filter(Boolean)
  if (names.length === 0) return []
  return sortWarnings(checkDur(names, allergies, activeDrugNames, BUNDLED_INTERACTIONS))
}

/** Client-side search over a loaded list (the API has no `q`): patient, phone, drug or prescriber. */
export function matchesPrescription(
  rx: { customer: { full_name: string | null; phone: string | null } | null; prescriber_name?: string | null; items: { drug_name: string | null }[] },
  query: string,
): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const hay = [rx.customer?.full_name, rx.customer?.phone, rx.prescriber_name, ...rx.items.map((i) => i.drug_name)]
  return hay.some((v) => v?.toLowerCase().includes(q))
}
