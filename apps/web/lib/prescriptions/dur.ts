import { and, eq, inArray } from "drizzle-orm"
import { customer, prescription, prescription_item, drug_interaction, type DrizzleDB } from "@pharmatrack/db"
import type { DurWarning } from "@pharmatrack/types"

// Allergy term → example member drugs (lowercase) for basic cross-class matching.
const ALLERGY_CLASSES: Record<string, string[]> = {
  penicillin: ["amoxicillin", "ampicillin", "amoxiclav", "augmentin", "flucloxacillin", "penicillin"],
  sulfa: ["sulfamethoxazole", "cotrimoxazole", "septrin", "sulfadoxine"],
  sulphur: ["sulfamethoxazole", "cotrimoxazole"],
  nsaid: ["ibuprofen", "diclofenac", "naproxen", "aspirin", "brufen"],
  nsaids: ["ibuprofen", "diclofenac", "naproxen", "aspirin", "brufen"],
  cephalosporin: ["cephalexin", "ceftriaxone", "cefuroxime", "cefixime"],
}

function tokens(name: string): string[] {
  return name.toLowerCase().replace(/[0-9]+/g, " ").replace(/[^a-z ]/g, " ").split(/\s+/).filter((t) => t.length >= 4)
}
function baseName(name: string): string {
  return tokens(name)[0] ?? name.toLowerCase().trim()
}
const overlap = (a: string, b: string) => a === b || a.includes(b) || b.includes(a)
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/**
 * Basic Drug Utilization Review at prescribing time:
 *  - allergy: prescribed drug matches a recorded allergy (incl. simple classes)
 *  - duplicate: drug duplicates the patient's active medication
 *  - interaction: a known pair appears among new + active drugs
 * Runs inside a tenant tx (org-scoped via RLS).
 */
export async function runDur(db: DrizzleDB, _orgId: string, customerId: string, newDrugNames: string[]): Promise<DurWarning[]> {
  const warnings: DurWarning[] = []
  const newDrugs = Array.from(new Set(newDrugNames.map(baseName).filter(Boolean)))
  if (newDrugs.length === 0) return warnings

  const [patient] = await db.select({ allergies: customer.allergies }).from(customer).where(eq(customer.id, customerId)).limit(1)
  const allergyTerms = (patient?.allergies ?? "").toLowerCase().split(/[,;\n/]/).map((s) => s.trim()).filter(Boolean)

  for (const drug of newDrugs) {
    for (const term of allergyTerms) {
      const members = ALLERGY_CLASSES[term]
      const hit = overlap(drug, term) || (members?.some((m) => overlap(drug, m)) ?? false)
      if (hit) {
        warnings.push({ type: "allergy", severity: "severe", message: `Patient allergy "${term}" — "${cap(drug)}" may be contraindicated` })
        break
      }
    }
  }

  // Active medications for this patient
  const rxs = await db.select({ id: prescription.id }).from(prescription)
    .where(and(eq(prescription.customer_id, customerId), eq(prescription.status, "active")))
  const rxIds = rxs.map((r) => r.id)
  let activeDrugs: string[] = []
  if (rxIds.length > 0) {
    const items = await db.select({ drug_name: prescription_item.drug_name }).from(prescription_item).where(inArray(prescription_item.prescription_id, rxIds))
    activeDrugs = items.map((i) => baseName(i.drug_name ?? "")).filter(Boolean)
  }

  for (const drug of newDrugs) {
    if (activeDrugs.some((a) => overlap(a, drug))) {
      warnings.push({ type: "duplicate", severity: "moderate", message: `"${cap(drug)}" duplicates an active prescription for this patient` })
    }
  }

  // Interactions across new + active drugs
  const allDrugs = Array.from(new Set([...newDrugs, ...activeDrugs]))
  const interactions = await db.select({ drug_a: drug_interaction.drug_a, drug_b: drug_interaction.drug_b, severity: drug_interaction.severity, note: drug_interaction.note }).from(drug_interaction)
  const seen = new Set<string>()
  for (const row of interactions) {
    const a = row.drug_a.toLowerCase(), b = row.drug_b.toLowerCase()
    if (allDrugs.some((d) => overlap(d, a)) && allDrugs.some((d) => overlap(d, b))) {
      const key = [a, b].sort().join("|")
      if (seen.has(key)) continue
      seen.add(key)
      warnings.push({ type: "interaction", severity: (row.severity as DurWarning["severity"]) ?? "moderate", message: `${cap(a)} + ${cap(b)}: ${row.note ?? "potential interaction"}` })
    }
  }

  return warnings
}
