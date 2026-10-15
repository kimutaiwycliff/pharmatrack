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
    expect(rows[0]!.problems).toEqual([
      'can\'t read expiry "whenever"', "no selling price", "opening stock needs a branch", "opening stock needs an expiry date",
    ])
  })
})
