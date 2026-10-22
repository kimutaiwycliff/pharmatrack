import { describe, expect, it } from "vitest"
import { autoMapping, cleanDate, cleanNumber, guessField, toImportRows } from "../importRows"

describe("guessField", () => {
  it("maps the column names real pharmacy sheets use", () => {
    expect(guessField("Item Description")).toBe("name")
    expect(guessField("Unit Price (KES)")).toBe("selling_price")
    expect(guessField("Selling Price per Box")).toBe("pack_selling_price")
    expect(guessField("Buying Price")).toBe("cost_price")
    expect(guessField("Qty on hand")).toBe("opening_qty")
    expect(guessField("Exp. Date")).toBe("expiry_date")
    expect(guessField("Batch No.")).toBe("batch_number")
    expect(guessField("Pack Size")).toBe("units_per_pack")
    expect(guessField("Bar Code")).toBe("gtin")
    expect(guessField("Notes")).toBe("")
  })

  it("maps each field to one column only", () => {
    expect(autoMapping(["Name", "Product", "Price"])).toEqual({ name: "Name", selling_price: "Price" })
  })
})

describe("cleanNumber", () => {
  it("strips currency and thousands separators", () => {
    expect(cleanNumber("KES 1,200.50")).toBe("1200.5")
    expect(cleanNumber("Ksh. 50/=")).toBe("50")
    expect(cleanNumber(30)).toBe("30")
    expect(cleanNumber("n/a")).toBe("")
  })
})

describe("cleanDate", () => {
  it("reads the common expiry formats, day-first", () => {
    expect(cleanDate("2027-03-31")).toBe("2027-03-31")
    expect(cleanDate("31/03/2027")).toBe("2027-03-31")
    expect(cleanDate("03/04/2027")).toBe("2027-04-03")
    expect(cleanDate("5.6.27")).toBe("2027-06-05")
    expect(cleanDate(new Date(2027, 2, 31))).toBe("2027-03-31")
    expect(cleanDate(46477)).toBe("2027-03-31")
  })

  it("treats month-only expiries as the end of the month", () => {
    expect(cleanDate("03/2027")).toBe("2027-03-31")
    expect(cleanDate("2028-02")).toBe("2028-02-29")
    expect(cleanDate("Mar-27")).toBe("2027-03-31")
    expect(cleanDate("March 2027")).toBe("2027-03-31")
    expect(cleanDate("15 Mar 2027")).toBe("2027-03-15")
  })

  it("rejects nonsense", () => {
    expect(cleanDate("31/02/2027")).toBeNull()
    expect(cleanDate("soon")).toBeNull()
    expect(cleanDate("")).toBeNull()
  })
})

describe("toImportRows", () => {
  const headers = ["Item", "Pack Price", "Pack Size", "Qty", "Expiry"]
  const mapping = autoMapping(headers)

  it("turns pack prices into unit prices and cleans values", () => {
    const [r] = toImportRows(headers, [["Panadol 500mg", "KES 1,000", "100", "200", "06/2028"]], mapping, { hasBranch: true })
    expect(r!.data).toEqual({ name: "Panadol 500mg", selling_price: "10", units_per_pack: "100", opening_qty: "200", expiry_date: "2028-06-30" })
    expect(r!.problems).toEqual([])
  })

  it("flags rows that would fail and skips blank rows", () => {
    const rows = toImportRows(headers, [["", "", "", "", ""], ["Amoxil", "", "", "5", "whenever"]], mapping, { hasBranch: false })
    expect(rows).toHaveLength(1)
    expect(rows[0]!.problems).toEqual(['can\'t read expiry "whenever"', "no selling price"])
    expect(rows[0]!.warnings).toEqual(["stock skipped — no branch selected"])
  })
})

describe("the PharmaTrack template", () => {
  const headers = [
    "Product name *", "Generic name (INN)", "Strength", "Dosage form", "Barcode (GTIN)", "Old item code", "Category", "Subcategory",
    "Smallest unit sold *", "Pack name", "Units per pack *", "Cost price per PACK (KES) *", "Selling price per UNIT (KES) *",
    "Selling price per PACK (KES)", "Qty in stock (UNITS)", "Batch number", "Expiry date", "Reorder level (UNITS)",
    "Prescription only? (Y/N)", "Controlled? (Y/N)", "Supplier", "Review note",
  ]
  it("maps every column automatically", () => {
    expect(autoMapping(headers)).toEqual({
      name: "Product name *", generic_name: "Generic name (INN)", strength: "Strength", dosage_form: "Dosage form",
      gtin: "Barcode (GTIN)", barcode_raw: "Old item code", category: "Category", subcategory: "Subcategory",
      base_unit: "Smallest unit sold *", pack_label: "Pack name", units_per_pack: "Units per pack *",
      pack_cost_price: "Cost price per PACK (KES) *", selling_price: "Selling price per UNIT (KES) *",
      pack_selling_price: "Selling price per PACK (KES)", opening_qty: "Qty in stock (UNITS)", batch_number: "Batch number",
      expiry_date: "Expiry date", reorder_level: "Reorder level (UNITS)", requires_prescription: "Prescription only? (Y/N)",
      is_controlled: "Controlled? (Y/N)", supplier: "Supplier",
    })
  })
  it("keeps a pack price beside the unit price, and works out unit cost from pack cost", () => {
    const m = autoMapping(headers)
    const row = ["Augmentin 625mg", "", "625mg", "Tablet", "", "A1001", "", "", "tablet", "Box", 14, 1450, 130, 1650, 42, "", "", 14, "Y", "", "Harleys", "note"]
    const [r] = toImportRows(headers, [row], m, { hasBranch: true })
    expect(r!.data).toMatchObject({ selling_price: "130", pack_selling_price: "1650", cost_price: "103.57", barcode_raw: "A1001", supplier: "Harleys", opening_qty: "42" })
    expect(r!.warnings).toEqual(["stock skipped — no expiry date"])
  })
  it("uses a lone Generic name column as the name", () => {
    expect(autoMapping(["Generic name", "Price"])).toEqual({ name: "Generic name", selling_price: "Price" })
  })
})
