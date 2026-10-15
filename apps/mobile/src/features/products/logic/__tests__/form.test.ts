import { describe, expect, it } from "vitest"
import {
  applyCatalogItem, looksLikeBarcode, packPriceFromUnit, unitPriceFromPack, categoryLabel, costFieldVisible, defaultBaseUnit, existingProductId, emptyProductForm, filterSuggestions, formFromProduct,
  marginPercent, mergeSuggestions, orderCategories, priceCents, productSubtitle, validateProductForm,
} from "../form"

const valid = () => ({ ...emptyProductForm(), name: "Amoxicillin", dosage_form: "Capsule", base_unit: "capsule", selling_price: "12.50" })

describe("validateProductForm", () => {
  it("requires name, dosage form (create), base unit and a positive price", () => {
    const r = validateProductForm({ ...emptyProductForm(), base_unit: " " }, { mode: "create", costVisible: true })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.errors.name).toBe("Generic name is required")
      expect(r.errors.dosage_form).toBe("Dosage form is required")
      expect(r.errors.base_unit).toBe("Base unit is required")
      expect(r.errors.selling_price).toBeTruthy()
    }
  })

  it("does not require a dosage form when editing", () => {
    const r = validateProductForm({ ...valid(), dosage_form: "" }, { mode: "edit", costVisible: false })
    expect(r.ok).toBe(true)
  })

  it("rejects bad numbers with field messages", () => {
    const r = validateProductForm(
      { ...valid(), selling_price: "0", cost_price: "abc", units_per_pack: "0", reorder_level: "-1", max_discount_percent: "120" },
      { mode: "create", costVisible: true },
    )
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(Object.keys(r.errors).sort()).toEqual(["cost_price", "max_discount_percent", "reorder_level", "selling_price", "units_per_pack"])
    }
  })

  it("ignores the cost field when cost is hidden", () => {
    const r = validateProductForm({ ...valid(), cost_price: "abc" }, { mode: "create", costVisible: false })
    expect(r.ok).toBe(true)
    if (r.ok) expect("cost_price" in r.body).toBe(false)
  })

  it("create body omits blanks and parses numbers", () => {
    const r = validateProductForm({ ...valid(), selling_price: "1,250.50", units_per_pack: "", cost_price: "800" }, { mode: "create", costVisible: true })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.body.selling_price).toBe(1250.5)
      expect(r.body.units_per_pack).toBe(1)
      expect(r.body.reorder_level).toBe(10)
      expect(r.body.cost_price).toBe(800)
      expect(r.body.max_discount_percent).toBeNull()
      expect("brand_name" in r.body).toBe(false)
      expect("category_id" in r.body).toBe(false)
      expect("is_active" in r.body).toBe(false)
    }
  })

  it("edit body sends nulls to clear fields and keeps is_active + generic name", () => {
    const r = validateProductForm({ ...valid(), generic_name: "Amoxicillin", is_active: false }, { mode: "edit", costVisible: true })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.body.brand_name).toBeNull()
      expect(r.body.cost_price).toBeNull()
      expect(r.body.is_active).toBe(false)
      expect(r.body.generic_name).toBe("Amoxicillin")
    }
  })
})

describe("form helpers", () => {
  it("round-trips a product into form values", () => {
    const f = formFromProduct({
      name: "X", brand_name: null, generic_name: null, manufacturer: null, gtin: "123", barcode_raw: null, strength: "5mg",
      dosage_form: "Tablet", category_id: null, supplier_id: null, base_unit: "tablet", pack_label: null, units_per_pack: 10,
      cost_price: 2.5, selling_price: 5, reorder_level: 20, max_discount_percent: null, is_controlled: false,
      requires_prescription: true, is_active: true, image_url: null,
    })
    expect(f.units_per_pack).toBe("10")
    expect(f.cost_price).toBe("2.5")
    expect(f.max_discount_percent).toBe("")
  })

  it("maps dosage forms to base units", () => {
    expect(defaultBaseUnit("Syrup")).toBe("ml")
    expect(defaultBaseUnit("Ointment")).toBe("g")
    expect(defaultBaseUnit("Injection")).toBe("vial")
    expect(defaultBaseUnit("Something")).toBe("unit")
  })

  it("merges and filters suggestions", () => {
    const all = mergeSuggestions(["tablet", "ml"], ["Tablet", "strip", "strip"])
    expect(all).toEqual(["tablet", "ml", "strip"])
    expect(filterSuggestions(all, "t")).toEqual(["tablet", "strip"])
    expect(filterSuggestions(all, "tablet")).toEqual([])
  })

  it("applies a catalogue row, keeping a scanned GTIN", () => {
    const v = applyCatalogItem({ ...emptyProductForm({ gtin: "999" }) }, {
      name: "Paracetamol", brand_name: null, manufacturer: null, gtin: null, strength: "500mg", dosage_form: "Tablet",
      base_unit: "tablet", is_controlled: false, requires_prescription: false,
    })
    expect(v.name).toBe("Paracetamol")
    expect(v.gtin).toBe("999")
    expect(v.strength).toBe("500mg")
  })

  it("fills molecule, pack and a starting price, keeping a typed price", () => {
    const item = {
      name: "Panadol", brand_name: "Panadol", manufacturer: "GSK", gtin: null, strength: "500mg", dosage_form: "Tablet",
      base_unit: "tablet", is_controlled: false, requires_prescription: false,
      generic_name: "paracetamol", pack_label: "Strip of 10", units_per_pack: 10, reference_price: 3,
    }
    const v = applyCatalogItem(emptyProductForm(), item)
    expect(v.generic_name).toBe("paracetamol")
    expect(v.pack_label).toBe("Strip of 10")
    expect(v.units_per_pack).toBe("10")
    expect(v.selling_price).toBe("3")
    expect(applyCatalogItem({ ...emptyProductForm(), selling_price: "5" }, item).selling_price).toBe("5")
  })

  it("converts pack and unit prices", () => {
    expect(unitPriceFromPack("1400", 28)).toBe("50")
    expect(unitPriceFromPack("100", 3)).toBe("33.33")
    expect(packPriceFromUnit("2.5", 10)).toBe("25")
    expect(unitPriceFromPack("", 10)).toBe("")
    expect(packPriceFromUnit("5", 0)).toBe("")
  })

  it("tells a scanned barcode from a typed name", () => {
    expect(looksLikeBarcode("6164001234567")).toBe(true)
    expect(looksLikeBarcode("0106164001234567172806301" + "0LOT")).toBe(true)
    expect(looksLikeBarcode("panadol")).toBe(false)
    expect(looksLikeBarcode("1234")).toBe(false)
  })

  it("keeps the supplier for the next product", () => {
    expect(emptyProductForm({ supplier_id: "s1" }).supplier_id).toBe("s1")
  })

  it("computes margin from cents", () => {
    expect(marginPercent("80", "100")).toBe(20)
    expect(marginPercent("", "100")).toBeNull()
    expect(marginPercent("120", "100")).toBe(-20)
  })

  it("parses prices to cents safely", () => {
    expect(priceCents("12.50")).toBe(1250)
    expect(priceCents(3.5)).toBe(350)
    expect(priceCents("abc")).toBeNull()
    expect(priceCents(null)).toBeNull()
  })

  it("labels and orders categories", () => {
    const all = [
      { id: "c", name: "Syrups", parent_id: "a" },
      { id: "a", name: "Analgesics", parent_id: null },
      { id: "b", name: "Antibiotics", parent_id: null },
    ]
    expect(categoryLabel(all[0]!, all)).toBe("Analgesics › Syrups")
    expect(orderCategories(all).map((c) => c.id)).toEqual(["a", "c", "b"])
  })

  it("builds a subtitle", () => {
    expect(productSubtitle({ strength: "500mg", dosage_form: "Tablet", brand_name: null })).toBe("500mg · Tablet")
  })
})

describe("existingProductId", () => {
  it("reads the duplicate's id from a 409 body", () => {
    expect(existingProductId({ error: "Already in your catalogue", existing_product_id: "p-1" })).toBe("p-1")
  })
  it("ignores bodies without a usable id", () => {
    expect(existingProductId(null)).toBeNull()
    expect(existingProductId({ error: "x" })).toBeNull()
    expect(existingProductId({ existing_product_id: 42 })).toBeNull()
    expect(existingProductId({ existing_product_id: "" })).toBeNull()
  })
})

describe("costFieldVisible", () => {
  it("is hidden without cost.view", () => {
    expect(costFieldVisible({ canViewCost: false, mode: "create" })).toBe(false)
    expect(costFieldVisible({ canViewCost: false, mode: "edit", product: { cost_price: 5 } })).toBe(false)
  })
  it("shows on create with cost.view", () => {
    expect(costFieldVisible({ canViewCost: true, mode: "create" })).toBe(true)
  })
  it("on edit, only when the server sent the key (null counts)", () => {
    expect(costFieldVisible({ canViewCost: true, mode: "edit", product: { cost_price: null } })).toBe(true)
    expect(costFieldVisible({ canViewCost: true, mode: "edit", product: {} })).toBe(false)
    expect(costFieldVisible({ canViewCost: true, mode: "edit", product: null })).toBe(false)
  })
})
