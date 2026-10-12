import { describe, expect, it } from "vitest"
import { buildCategoryRows, categoryNameError, parentOptions, type Category } from "../categories"
import { buildImportPreview, issueLabel, missingRequiredColumns } from "../importPreview"
import { isDepartmentDone, seedResultMessage, seedTotals, unseedResultMessage } from "../catalogSeed"

const cat = (id: string, name: string, parent_id: string | null = null): Category => ({ id, name, parent_id })

describe("buildCategoryRows", () => {
  it("puts children right after their parent, keeping server order", () => {
    const rows = buildCategoryRows([cat("a", "Analgesics"), cat("c1", "Opioids", "a"), cat("b", "Antibiotics"), cat("c2", "NSAIDs", "a")])
    expect(rows.map((r) => `${r.kind}:${r.cat.name}`)).toEqual([
      "parent:Analgesics",
      "child:Opioids",
      "child:NSAIDs",
      "parent:Antibiotics",
    ])
    expect(rows[0]!.childCount).toBe(2)
    expect(rows[3]!.childCount).toBe(0)
  })

  it("treats an orphan (parent missing) as top-level instead of dropping it", () => {
    const rows = buildCategoryRows([cat("x", "Orphan", "gone")])
    expect(rows).toEqual([{ kind: "parent", cat: cat("x", "Orphan", "gone"), childCount: 0 }])
  })

  it("handles an empty list", () => {
    expect(buildCategoryRows([])).toEqual([])
  })
})

describe("parentOptions / categoryNameError", () => {
  it("offers only top-level categories as parents", () => {
    expect(parentOptions([cat("a", "A"), cat("b", "B", "a")]).map((c) => c.id)).toEqual(["a"])
  })

  it("validates the name like the API", () => {
    expect(categoryNameError("   ")).toBe("Category name is required")
    expect(categoryNameError("x".repeat(61))).toMatch(/60/)
    expect(categoryNameError("  Vitamins ")).toBeNull()
  })
})

describe("buildImportPreview", () => {
  it("flags missing names and bad prices with 1-based row numbers", () => {
    const p = buildImportPreview([
      { name: "Panadol", selling_price: "50" },
      { name: "", selling_price: "20" },
      { name: "Amoxil", selling_price: "" },
      { name: "Zinc", selling_price: "abc" },
      { name: "Free", selling_price: "0" },
    ])
    expect(p.flagged).toBe(4)
    expect(p.rows[0]).toEqual({ row: 1, name: "Panadol", price: "50", issues: [] })
    expect(p.rows[1]!.issues).toEqual(["missing_name"])
    expect(p.rows[2]!.issues).toEqual(["missing_price"])
    expect(p.rows[3]!.issues).toEqual(["bad_price"])
    expect(p.rows[4]!.row).toBe(5)
    expect(p.rows[4]!.issues).toEqual(["bad_price"])
  })

  it("labels every issue", () => {
    expect(issueLabel("missing_name")).toBe("No name")
    expect(issueLabel("missing_price")).toBe("No selling price")
    expect(issueLabel("bad_price")).toMatch(/above 0/)
  })

  it("lists missing required columns", () => {
    expect(missingRequiredColumns({ name: "a", selling_price: "1" })).toEqual([])
    expect(missingRequiredColumns({ name: "a" })).toEqual(["selling_price"])
    expect(missingRequiredColumns(undefined)).toEqual(["name", "selling_price"])
  })
})

describe("catalog seed helpers", () => {
  it("totals departments without over-counting", () => {
    expect(
      seedTotals([
        { category: "A", total: 10, seeded: 4 },
        { category: "B", total: 5, seeded: 7 },
      ]),
    ).toEqual({ total: 15, seeded: 9, remaining: 6 })
    expect(isDepartmentDone({ category: "B", total: 5, seeded: 5 })).toBe(true)
    expect(isDepartmentDone({ category: "A", total: 10, seeded: 4 })).toBe(false)
  })

  it("formats the result toasts", () => {
    expect(seedResultMessage(1, 0)).toBe("Added 1 product")
    expect(seedResultMessage(12, 3)).toBe("Added 12 products, updated 3")
    expect(unseedResultMessage(5, 2)).toBe("Removed 5 products (kept 2 already in use)")
    expect(unseedResultMessage(1, 0)).toBe("Removed 1 product")
  })
})
