import { describe, expect, it } from "vitest"
import { catalogSearchTerm, searchThreshold } from "../search"

describe("catalogSearchTerm", () => {
  it("maps pharmacy shorthand to the molecule", () => {
    expect(catalogSearchTerm("PCM")).toBe("paracetamol")
    expect(catalogSearchTerm(" vit  c ")).toBe("ascorbic acid")
  })

  it("leaves anything else as typed", () => {
    expect(catalogSearchTerm(" Amoxyl ")).toBe("Amoxyl")
  })
})

describe("searchThreshold", () => {
  it("clamps request overrides", () => {
    expect(searchThreshold("0")).toBe(0.1)
    expect(searchThreshold("0.45")).toBe(0.45)
  })
})
