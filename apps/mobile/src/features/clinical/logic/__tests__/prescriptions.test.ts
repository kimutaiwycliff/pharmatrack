import { describe, expect, it } from "vitest"
import {
  drugLabel, durBadge, emptyLine, hasSevere, matchesPrescription, previewDur, rxStatusBadge, sortWarnings, validatePrescription,
  type RxFormInput,
} from "../prescriptions"

const base: RxFormInput = { patientName: "John Otieno", phone: "", prescriberName: "", prescriberRegNo: "", diagnosis: "", lines: [] }
const line = (key: string, patch: Partial<ReturnType<typeof emptyLine>> = {}) => ({ ...emptyLine(key), ...patch })

describe("validatePrescription", () => {
  it("builds trimmed items and drops blank lines", () => {
    const r = validatePrescription({
      ...base,
      lines: [line("1", { drug_name: " Amoxicillin 500mg ", product_id: "p1", frequency: "TDS", quantity: "21" }), line("2")],
    })
    expect(r.valid).toBe(true)
    expect(r.items).toEqual([
      { product_id: "p1", drug_name: "Amoxicillin 500mg", dose: undefined, frequency: "TDS", duration: undefined, quantity: 21, instructions: undefined },
    ])
  })
  it("requires a patient and at least one drug", () => {
    const r = validatePrescription({ ...base, patientName: "", lines: [line("1")] })
    expect(r.valid).toBe(false)
    expect(r.errors.patientName).toBe("Patient name is required")
    expect(r.errors.items).toBe("Add at least one drug")
  })
  it("puts line errors under the right line", () => {
    const r = validatePrescription({ ...base, lines: [line("a", { dose: "1 tab" }), line("b", { drug_name: "Paracetamol", quantity: "1.5" })] })
    expect(r.valid).toBe(false)
    expect(r.errors.lines.a?.drug_name).toMatch(/Enter the drug/)
    expect(r.errors.lines.b?.quantity).toMatch(/Whole number/)
    expect(r.errors.items).toBeUndefined()
  })
  it("enforces the server's length limits", () => {
    const r = validatePrescription({ ...base, prescriberRegNo: "x".repeat(61), lines: [line("1", { drug_name: "Ibuprofen" })] })
    expect(r.valid).toBe(false)
    expect(r.errors.prescriberRegNo).toMatch(/60/)
  })
})

describe("drugLabel", () => {
  it("appends the strength once", () => {
    expect(drugLabel("Amoxicillin", "500mg")).toBe("Amoxicillin 500mg")
    expect(drugLabel("Amoxicillin 500MG caps", "500mg")).toBe("Amoxicillin 500MG caps")
    expect(drugLabel("ORS", null)).toBe("ORS")
  })
})

describe("DUR helpers", () => {
  it("maps severities to badge colours", () => {
    expect(durBadge("severe")).toEqual({ status: "danger", label: "Severe" })
    expect(durBadge("major").status).toBe("danger")
    expect(durBadge("moderate").status).toBe("warning")
    expect(durBadge("mild")).toEqual({ status: "neutral", label: "Mild" })
    expect(durBadge("minor").label).toBe("Minor")
    expect(durBadge("unknown").status).toBe("warning")
  })
  it("sorts severe first and detects severe findings", () => {
    const w = [{ severity: "mild" }, { severity: "severe" }, { severity: "moderate" }]
    expect(sortWarnings(w).map((x) => x.severity)).toEqual(["severe", "moderate", "mild"])
    expect(hasSevere(w)).toBe(true)
    expect(hasSevere([{ severity: "moderate" }])).toBe(false)
  })
  it("previews a known interaction among the new drugs", () => {
    const w = previewDur(["Warfarin 5mg", "Aspirin 75mg"], null, [])
    expect(w).toHaveLength(1)
    expect(w[0]).toMatchObject({ type: "interaction", severity: "severe" })
  })
  it("flags allergies (incl. drug classes) and duplicates of active medication", () => {
    const w = previewDur(["Amoxicillin 500mg"], "Penicillin", ["Amoxicillin 250mg"])
    expect(w.map((x) => x.type).sort()).toEqual(["allergy", "duplicate"])
    expect(w[0]?.severity).toBe("severe")
  })
  it("returns nothing for empty input", () => {
    expect(previewDur([" ", ""], "penicillin", [])).toEqual([])
  })
})

describe("rxStatusBadge / matchesPrescription", () => {
  it("colours statuses", () => {
    expect(rxStatusBadge("active").status).toBe("ok")
    expect(rxStatusBadge("cancelled").status).toBe("danger")
    expect(rxStatusBadge("completed").status).toBe("neutral")
  })
  it("matches patient, phone, drug or prescriber", () => {
    const rx = { customer: { full_name: "Mary Achieng", phone: "0711000111" }, prescriber_name: "Dr. Kamau", items: [{ drug_name: "Metformin 500mg" }] }
    expect(matchesPrescription(rx, "achieng")).toBe(true)
    expect(matchesPrescription(rx, "0711")).toBe(true)
    expect(matchesPrescription(rx, "metf")).toBe(true)
    expect(matchesPrescription(rx, "kamau")).toBe(true)
    expect(matchesPrescription(rx, "insulin")).toBe(false)
    expect(matchesPrescription(rx, "  ")).toBe(true)
  })
})
