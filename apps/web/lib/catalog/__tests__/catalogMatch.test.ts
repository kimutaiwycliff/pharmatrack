import { describe, expect, it } from "vitest"
import { buildCatalogIndex, matchCatalog, normStrength, type CatalogEntry } from "@pharmatrack/core"
import { deriveGenericName } from "@/lib/generic-name"

const e = (over: Partial<CatalogEntry>): CatalogEntry => ({
  id: over.name!, name: "", brand_name: null, generic_name: null, strength: null, dosage_form: "Tablet", base_unit: "tablet",
  manufacturer: null, is_controlled: false, requires_prescription: true, category: null, subcategory: null, source: "ppb", ppb_registration_no: null, ...over,
})
const index = buildCatalogIndex([
  e({ name: "Adalat LA", strength: "30mg", generic_name: "nifedipine", ppb_registration_no: "H1" }),
  e({ name: "Augmentin", strength: "625mg", generic_name: "amoxicillin + clavulanic acid" }),
  e({ name: "Augmentin", strength: "228mg/5ml", dosage_form: "Suspension", generic_name: "amoxicillin + clavulanic acid" }),
  e({ name: "Lysodol", dosage_form: "Gel", generic_name: "aceclofenac" }),
  e({ name: "Acnevate", dosage_form: "Gel", generic_name: "benzoyl peroxide" }),
  e({ name: "Benzyl benzoate", dosage_form: "Lotion", generic_name: "benzyl benzoate" }),
  e({ name: "Zealor", strength: "400mg", generic_name: "aciclovir" }),
  e({ name: "Cyclo P", dosage_form: "Eye Drops", generic_name: "cyclopentolate" }),
])
const m = (name: string) => {
  const r = matchCatalog(index, { name })
  return r ? `${r.confidence}: ${r.entry.name} ${r.entry.strength ?? ""}`.trim() : null
}

describe("matchCatalog", () => {
  it("brand + strength + form agreeing is an exact match", () => {
    expect(m("ADALAT LA 30MG 30`S")).toBe("exact: Adalat LA 30mg")
    expect(m("AUGMENTIN 625MG 14'S")).toBe("exact: Augmentin 625mg")
  })
  it("a brand without the same strength or form is only a brand match", () => {
    expect(m("AUGMENTIN 1G TABS")).toMatch(/^brand: Augmentin/)
    expect(m("ACECLOFENAC (LYSODOL 100MG) 30'S")).toBe("brand: Lysodol")
  })
  it("prefers the leading brand over a bracketed generic", () => {
    expect(m("ACNEVATE (Benzyl Peroxide) Gel 5%")).toBe("brand: Acnevate")
  })
  it("doesn't stretch a short brand onto a longer word", () => {
    expect(m("ACICLOVIR (CYCLOVIR) 400MG TABS")).toBe("generic: Zealor 400mg")
  })
  it("returns null for things it doesn't know", () => {
    expect(m("ACCUFAST PREGNANCY TEST 1S")).toBeNull()
  })
  it("normalises strengths", () => {
    expect(normStrength("500 MG")).toBe("500mg")
    expect(normStrength("Augmentin 228mg/5ml")).toBe("228mg/5ml")
    expect(normStrength(null)).toBeNull()
  })
})

describe("deriveGenericName", () => {
  it("drops pack counts, volumes, strengths and form words", () => {
    expect(deriveGenericName("AMOXIL 500MG CAPS 100'S")).toBe("amoxil")
    expect(deriveGenericName("A.P.C TABLETS 100`S")).toBe("a p c")
    expect(deriveGenericName("AERIUS SYRUP 60MLS")).toBe("aerius")
  })
})
