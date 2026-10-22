import { describe, expect, it } from "vitest"
import {
  DEFAULT_TAXONOMY, buildCategoryOptions, categoryLabel, categoryPayload, findTaxonomyEntry, optionForSuggestion,
  suggestCategory, taxonomyEntries, taxonomyKey, type TenantCategory,
} from "@pharmatrack/core"

const s = (name: string, generic?: string, dosageForm?: string) => {
  const r = suggestCategory({ name, generic, dosageForm })
  return r ? `${r.category} / ${r.subcategory} (${r.confidence})` : null
}

describe("default taxonomy", () => {
  it("has 20 departments, unique keys, and every key resolves", () => {
    expect(Object.keys(DEFAULT_TAXONOMY)).toHaveLength(20)
    const keys = taxonomyEntries().map((e) => e.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(taxonomyKey("Pain & Fever", "Gout")).toBe("pain-fever/gout")
    expect(findTaxonomyEntry("pain-fever/gout")?.subcategory).toBe("Gout")
    expect(findTaxonomyEntry("pain-fever/nonsense")).toBeNull()
  })
})

describe("suggestCategory", () => {
  it("places medicines by molecule", () => {
    expect(s("Amoxicillin 500mg Capsules")).toBe("Antibiotics & Infections / Penicillins (likely)")
    expect(s("Amlodipine 5mg")).toBe("Heart & Blood Pressure / Blood pressure (likely)")
    expect(s("Lonart", "artemether lumefantrine")).toBe("Malaria & Parasites / Antimalarials (likely)")
    expect(s("Metformin 500mg")).toBe("Diabetes & Hormones / Diabetes tablets (likely)")
  })

  it("lets the dosage form decide eye, skin and inhaled products", () => {
    expect(s("Tobradex", "tobramycin dexamethasone", "Eye Drops, Suspension")).toBe("Eye & Ear Care / Eye infections (likely)")
    expect(s("Voltaren Emulgel", "diclofenac", "Gel")).toBe("Pain & Fever / Pain rubs & gels (likely)")
    expect(s("Canesten", "clotrimazole", "Cream")).toBe("Skin Care / Antifungal creams (likely)")
    expect(s("Ventolin Evohaler", "salbutamol", "Inhalation")).toBe("Asthma & Respiratory / Inhalers & nebules (likely)")
  })

  it("knows common Kenyan brands, but only at the start of the name", () => {
    expect(s("Zentel tabs 400mg")).toBe("Malaria & Parasites / Dewormers (likely)")
    expect(s("Mara Moja tablets")).toBe("Pain & Fever / Paracetamol & combinations (likely)")
    expect(s("Gaviscon Double Action")).toBe("Stomach & Digestion / Antacids & heartburn (maybe)")
  })

  it("tolerates misspelt molecules, but only as a suggestion", () => {
    expect(s("Cetrizine 10mg")).toBe("Cough, Cold & Allergy / Allergy & antihistamines (maybe)")
  })

  it("offers retail products by name", () => {
    expect(s("Durex Extra Safe 3s")).toBe("Sexual Health / Condoms (maybe)")
    expect(s("Pampers Size 3")).toBe("Baby & Mother / Diapers & wipes (maybe)")
    expect(s("Elastoplast strips 100s")).toBe("First Aid & Medical Devices / Dressings, plasters & bandages (maybe)")
  })

  it("returns null rather than guessing", () => {
    expect(s("XYZ 100s")).toBeNull()
    expect(s("")).toBeNull()
  })
})

describe("category options", () => {
  const tenant: TenantCategory[] = [
    { id: "p1", name: "Pain & Fever", parent_id: null, default_key: "pain-fever" },
    { id: "c1", name: "Paracetamol stuff", parent_id: "p1", default_key: "pain-fever/paracetamol-combinations" },
    { id: "p2", name: "My Specials", parent_id: null },
    { id: "p3", name: "skin care", parent_id: null }, // same name as a default, different case
    { id: "c3", name: "Acne care", parent_id: "p3" },
  ]
  const options = buildCategoryOptions(tenant)

  it("merges the pharmacy's own categories with the defaults it hasn't used", () => {
    const pain = options.filter((o) => o.group === "Pain & Fever")
    expect(pain[0]).toEqual({ value: "c1", label: "Paracetamol stuff", group: "Pain & Fever", isNew: false })
    expect(pain.some((o) => o.label === "Paracetamol & combinations")).toBe(false) // renamed, still linked
    expect(pain.some((o) => o.value === "default:pain-fever/gout" && o.isNew)).toBe(true)
    // Same-named department: its own "Acne care" is used, not duplicated.
    const skin = options.filter((o) => o.group === "skin care")
    expect(skin.filter((o) => o.label === "Acne care")).toEqual([{ value: "c3", label: "Acne care", group: "skin care", isNew: false }])
    expect(options.some((o) => o.group === "Skin Care")).toBe(false)
    // Custom department without children is selectable itself.
    expect(options.some((o) => o.value === "p2" && o.label === "My Specials")).toBe(true)
    // Departments the pharmacy doesn't have appear as defaults.
    expect(options.some((o) => o.value === "default:malaria-parasites/antimalarials")).toBe(true)
  })

  it("maps a suggestion onto the pharmacy's own category when it has one", () => {
    expect(optionForSuggestion(options, tenant, { category: "Pain & Fever", subcategory: "Paracetamol & combinations" })).toBe("c1")
    expect(optionForSuggestion(options, tenant, { category: "Skin Care", subcategory: "Acne care" })).toBe("c3")
    expect(optionForSuggestion(options, tenant, { category: "Pain & Fever", subcategory: "Gout" })).toBe("default:pain-fever/gout")
  })

  it("labels and sends values", () => {
    expect(categoryLabel("c1", options, tenant)).toBe("Paracetamol stuff · Pain & Fever")
    expect(categoryLabel("default:pain-fever/gout", options, tenant)).toBe("Gout · Pain & Fever")
    expect(categoryPayload("default:pain-fever/gout")).toEqual({ category_key: "pain-fever/gout" })
    expect(categoryPayload("c1")).toEqual({ category_id: "c1" })
    expect(categoryPayload(null)).toEqual({})
  })
})
