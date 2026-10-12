import { describe, expect, it } from "vitest"
import { filterProducts, resolveImageUrl, searchCatalogRows, searchTerm } from "../list"

const rows = [
  { id: "1", is_active: true, requires_prescription: true, is_controlled: false },
  { id: "2", is_active: false, requires_prescription: false, is_controlled: true },
]

describe("list helpers", () => {
  it("filters loaded rows by chip", () => {
    expect(filterProducts(rows, "all")).toHaveLength(2)
    expect(filterProducts(rows, "active").map((r) => r.id)).toEqual(["1"])
    expect(filterProducts(rows, "inactive").map((r) => r.id)).toEqual(["2"])
    expect(filterProducts(rows, "rx").map((r) => r.id)).toEqual(["1"])
    expect(filterProducts(rows, "controlled").map((r) => r.id)).toEqual(["2"])
  })

  it("only searches from two characters", () => {
    expect(searchTerm(" a ")).toBeUndefined()
    expect(searchTerm(" am ")).toBe("am")
  })

  it("searches catalogue rows, prefix matches first", () => {
    const cat = [
      { name: "Co-amoxiclav", strength: "625mg" },
      { name: "Amoxicillin", strength: "500mg" },
      { name: "Paracetamol", strength: "500mg" },
    ]
    expect(searchCatalogRows(cat, "amox").map((r) => r.name)).toEqual(["Amoxicillin", "Co-amoxiclav"])
    expect(searchCatalogRows(cat, "")).toEqual([])
  })

  it("resolves server-relative image URLs", () => {
    expect(resolveImageUrl("/api/media/a.jpg", "https://x.co/")).toBe("https://x.co/api/media/a.jpg")
    expect(resolveImageUrl("file:///data/p.jpg", undefined)).toBe("file:///data/p.jpg")
    expect(resolveImageUrl("/api/media/a.jpg", undefined)).toBeNull()
    expect(resolveImageUrl(null, "https://x.co")).toBeNull()
  })
})
