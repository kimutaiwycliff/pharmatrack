import { describe, expect, it } from "vitest"
import { groupCatalog, normGeneric, quickStartTree, searchGroups, type QsEntry } from "@pharmatrack/core"

const e = (over: Partial<QsEntry>): QsEntry => ({
  id: over.name!, name: "", brand: null, generic: null, strength: null, form: "Tablet", manufacturer: null,
  category: "Heart & Blood Pressure", subcategory: "Blood pressure", source: "ppb", ppb: null, rx: true, controlled: false, price: null, ...over,
})

describe("normGeneric", () => {
  it("drops salts and pharmacopoeia tags, keeps combinations", () => {
    expect(normGeneric("Amlodipine Besilate BP")).toBe("amlodipine")
    expect(normGeneric("Telmisartan & Amlodipine")).toBe("telmisartan + amlodipine")
    // Sizes are part of what the product is; doses aren't (they're the strength).
    expect(normGeneric("baby diapers size 3")).toBe("baby diapers size 3")
    expect(normGeneric("amoxicillin 500mg")).toBe("amoxicillin")
  })
})

describe("groupCatalog", () => {
  const groups = groupCatalog([
    e({ name: "Amlong 5", generic: "amlodipine besilate", strength: "5mg", ppb: "H1" }),
    e({ name: "Amlodipine 5mg", generic: "amlodipine", strength: "5mg", source: "curated", price: 3 }),
    e({ name: "Norvasc 5mg", generic: "Amlodipine", form: "Film-coated Tablet" }),
    e({ name: "Amlodipine 10mg", generic: "amlodipine", strength: "10mg" }),
    e({ name: "Telgood 40", generic: "telmisartan", strength: "40mg" }),
    e({ name: "Telmilok 40", generic: "telmisartan", strength: "40mg" }),
  ])
  it("groups brands of the same molecule, strength and form", () => {
    const amlo5 = groups.find((g) => g.label === "Amlodipine 5mg · Tablet")!
    expect(amlo5.entries.map((x) => x.name)).toEqual(["Amlodipine 5mg", "Amlong 5", "Norvasc 5mg"]) // curated first
    expect(amlo5.common).toBe(true)
    expect(amlo5.defaultId).toBe("Amlodipine 5mg")
  })
  it("asks for a brand when no common one exists", () => {
    expect(groups.find((g) => g.label === "Telmisartan 40mg · Tablet")!.defaultId).toBeNull()
    expect(groups.find((g) => g.label === "Amlodipine 10mg · Tablet")!.defaultId).toBe("Amlodipine 10mg")
  })
  it("asks which brand when several common brands are equally likely", () => {
    const [diapers] = groupCatalog([
      e({ name: "Pampers size 3", generic: "baby diapers size 3", source: "curated", form: "Other", category: "Baby & Mother", subcategory: "Diapers & wipes" }),
      e({ name: "Huggies size 3", generic: "baby diapers size 3", source: "curated", form: "Other", category: "Baby & Mother", subcategory: "Diapers & wipes" }),
    ])
    expect(diapers!.label).toBe("Baby Diapers Size 3 · Other")
    expect(diapers!.defaultId).toBeNull()
  })
  it("lists common rows first", () => {
    expect(groups[0]!.common).toBe(true)
  })
  it("builds the tree and searches brands", () => {
    expect(quickStartTree(groups)).toEqual([{ category: "Heart & Blood Pressure", groups: 3, subcategories: [{ name: "Blood pressure", groups: 3 }] }])
    expect(searchGroups(groups, "norvasc").map((g) => g.label)).toEqual(["Amlodipine 5mg · Tablet"])
    expect(searchGroups(groups, "telmi 40")).toHaveLength(1)
  })
})
