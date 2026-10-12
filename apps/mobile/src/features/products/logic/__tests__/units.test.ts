import { describe, expect, it } from "vitest"
import { packSizeValues, plural, validatePackSize, validateSplit } from "../units"

describe("validatePackSize", () => {
  it("requires label, whole units ≥ 1 and a positive price", () => {
    const r = validatePackSize({ pack_label: " ", units_per_pack: "1.5", selling_price: "0", barcode: "" }, "tablet")
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.errors.pack_label).toBeTruthy()
      expect(r.errors.units_per_pack).toContain("tablets")
      expect(r.errors.selling_price).toBeTruthy()
    }
  })

  it("builds the API body", () => {
    const r = validatePackSize({ pack_label: " Strip of 10 ", units_per_pack: "10", selling_price: "50", barcode: "" }, "tablet")
    expect(r).toEqual({ ok: true, body: { pack_label: "Strip of 10", units_per_pack: 10, selling_price: 50, barcode: null } })
  })

  it("round-trips values", () => {
    expect(packSizeValues({ pack_label: "Box", units_per_pack: 100, selling_price: 450.5, barcode: null })).toEqual({
      pack_label: "Box", units_per_pack: "100", selling_price: "450.5", barcode: "",
    })
  })

  it("pluralises units sensibly", () => {
    expect(plural("tablet")).toBe("tablets")
    expect(plural("ml")).toBe("ml")
    expect(plural("capsules")).toBe("capsules")
  })
})

describe("validateSplit", () => {
  const product = { base_unit: "strip", selling_price: 50 }

  it("enforces factor 2–1000 and a new, different unit", () => {
    const r = validateSplit({ factor: "1", unit: "Strip" }, product)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.errors.factor).toBeTruthy()
      expect(r.errors.unit).toBe("Pick a different, smaller unit")
    }
    expect(validateSplit({ factor: "1001", unit: "capsule" }, product).ok).toBe(false)
    expect(validateSplit({ factor: "10", unit: "x".repeat(41) }, product).ok).toBe(false)
  })

  it("previews the new per-unit price like the server", () => {
    const r = validateSplit({ factor: "10", unit: " capsule " }, product)
    expect(r).toEqual({ ok: true, preview: { factor: 10, unit: "capsule", newPriceCents: 500, rounded: false } })
  })

  it("flags rounding", () => {
    const r = validateSplit({ factor: "3", unit: "tablet" }, { base_unit: "strip", selling_price: "10.00" })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.preview.newPriceCents).toBe(333)
      expect(r.preview.rounded).toBe(true)
    }
  })
})
