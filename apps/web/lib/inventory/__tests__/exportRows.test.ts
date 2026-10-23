import { describe, expect, it } from "vitest"
import { EXPORT_HEADERS, EXPORT_WIDTHS, exportFileName, toExportRows, type ExportProduct } from "../exportRows"
import { autoMapping, toImportRows } from "../importRows"

const amox: ExportProduct = {
  name: "Augmentin 625mg Tablets", generic_name: "amoxicillin + clavulanic acid", strength: "625mg", dosage_form: "Tablet",
  gtin: "5000123456789", barcode_raw: "A1001", category: "Antibiotics & Infections", subcategory: "Penicillins",
  base_unit: "tablet", pack_label: "Box", units_per_pack: 14, cost_price: 103.57, selling_price: 130, pack_selling_price: 1650,
  reorder_level: 14, requires_prescription: true, is_controlled: false, supplier: "Harleys Ltd",
  batches: [{ batch_number: "B1", expiry_date: "2027-06-30", quantity: 42 }, { batch_number: "B2", expiry_date: "2028-01-31", quantity: 14 }],
}

describe("export → import round trip", () => {
  it("uses the import template's columns, all recognised by the importer", () => {
    expect(EXPORT_WIDTHS).toHaveLength(EXPORT_HEADERS.length)
    const mapping = autoMapping([...EXPORT_HEADERS])
    expect(Object.keys(mapping)).toHaveLength(EXPORT_HEADERS.length)
  })

  it("re-imports to the same product, prices and stock", () => {
    const headers = [...EXPORT_HEADERS]
    const rows = toExportRows([amox], { withStock: true })
    expect(rows).toHaveLength(2) // one per batch
    const [r1, r2] = toImportRows(headers, rows, autoMapping(headers), { hasBranch: true })
    expect(r1!.data).toMatchObject({
      name: "Augmentin 625mg Tablets", generic_name: "amoxicillin + clavulanic acid", strength: "625mg", gtin: "5000123456789",
      barcode_raw: "A1001", category: "Antibiotics & Infections", subcategory: "Penicillins", units_per_pack: "14",
      selling_price: "130", pack_selling_price: "1650", cost_price: "103.57", opening_qty: "42", batch_number: "B1",
      expiry_date: "2027-06-30", requires_prescription: "Y", is_controlled: "N", supplier: "Harleys Ltd",
    })
    expect(r2!.data).toMatchObject({ opening_qty: "14", batch_number: "B2", expiry_date: "2028-01-31" })
    expect(r1!.problems).toEqual([])
  })

  it("leaves stock (and hidden costs) blank in a products-only export", () => {
    const [row] = toExportRows([{ ...amox, cost_price: null }], { withStock: false })
    expect(row![11]).toBeNull() // cost per pack
    expect(row!.slice(14, 17)).toEqual([null, null, null])
  })

  it("names the file", () => {
    expect(exportFileName("Afya/Bora: Ltd", "stock", "2026-10-23", "Westlands")).toBe("Afya Bora Ltd — stock at Westlands 2026-10-23.xlsx")
  })
})
