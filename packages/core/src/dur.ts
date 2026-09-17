// Pure Drug Utilization Review matching helpers, extracted from
// apps/web/lib/prescriptions/dur.ts (ADR-014) so both the web app (querying
// Postgres) and the Offline Edition mobile app (querying local SQLite) share
// one implementation — only the DB I/O that gathers `activeDrugNames`/
// `interactionRows`/`allergiesRaw` differs per app.

export interface DurInteractionRow {
  drugA: string
  drugB: string
  severity: string
  note: string | null
}

export interface DurWarning {
  type: "allergy" | "duplicate" | "interaction"
  severity: "mild" | "moderate" | "severe"
  message: string
}

const ALLERGY_CLASSES: Record<string, string[]> = {
  penicillin: ["amoxicillin", "ampicillin", "amoxiclav", "augmentin", "flucloxacillin", "penicillin"],
  sulfa: ["sulfamethoxazole", "cotrimoxazole", "septrin", "sulfadoxine"],
  sulphur: ["sulfamethoxazole", "cotrimoxazole"],
  nsaid: ["ibuprofen", "diclofenac", "naproxen", "aspirin", "brufen"],
  nsaids: ["ibuprofen", "diclofenac", "naproxen", "aspirin", "brufen"],
  cephalosporin: ["cephalexin", "ceftriaxone", "cefuroxime", "cefixime"],
}

export function tokens(name: string): string[] {
  return name.toLowerCase().replace(/[0-9]+/g, " ").replace(/[^a-z ]/g, " ").split(/\s+/).filter((t) => t.length >= 4)
}
export function baseName(name: string): string {
  return tokens(name)[0] ?? name.toLowerCase().trim()
}
export const overlap = (a: string, b: string): boolean => a === b || a.includes(b) || b.includes(a)
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/**
 * Basic Drug Utilization Review at prescribing time — pure function, no DB
 * access. Caller supplies: the new drug names being prescribed, the raw
 * allergies string already on file for the patient, the patient's other
 * ACTIVE prescriptions' drug names, and the full drug_interaction reference
 * table (small enough to load wholesale on both web and mobile).
 */
export function checkDur(
  newDrugNames: string[],
  allergiesRaw: string | null | undefined,
  activeDrugNamesRaw: string[],
  interactionRows: DurInteractionRow[],
): DurWarning[] {
  const warnings: DurWarning[] = []
  const newDrugs = Array.from(new Set(newDrugNames.map(baseName).filter(Boolean)))
  if (newDrugs.length === 0) return warnings

  const allergyTerms = (allergiesRaw ?? "").toLowerCase().split(/[,;\n/]/).map((s) => s.trim()).filter(Boolean)
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

  const activeDrugs = activeDrugNamesRaw.map((d) => baseName(d)).filter(Boolean)
  for (const drug of newDrugs) {
    if (activeDrugs.some((a) => overlap(a, drug))) {
      warnings.push({ type: "duplicate", severity: "moderate", message: `"${cap(drug)}" duplicates an active prescription for this patient` })
    }
  }

  const allDrugs = Array.from(new Set([...newDrugs, ...activeDrugs]))
  const seen = new Set<string>()
  for (const row of interactionRows) {
    const a = row.drugA.toLowerCase(), b = row.drugB.toLowerCase()
    if (allDrugs.some((d) => overlap(d, a)) && allDrugs.some((d) => overlap(d, b))) {
      const key = [a, b].sort().join("|")
      if (seen.has(key)) continue
      seen.add(key)
      warnings.push({
        type: "interaction",
        severity: (row.severity as DurWarning["severity"]) ?? "moderate",
        message: `${cap(a)} + ${cap(b)}: ${row.note ?? "potential interaction"}`,
      })
    }
  }

  return warnings
}
