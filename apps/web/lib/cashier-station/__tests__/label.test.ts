import { describe, it, expect } from "vitest"
import { orderLabel, parseOrderLabel } from "../label"

describe("order labels", () => {
  it("count A-001 … A-999, then B-001", () => {
    expect(orderLabel(1)).toBe("A-001")
    expect(orderLabel(47)).toBe("A-047")
    expect(orderLabel(999)).toBe("A-999")
    expect(orderLabel(1000)).toBe("B-001")
  })

  it("read back what the cashier types", () => {
    expect(parseOrderLabel("A-047")).toBe(47)
    expect(parseOrderLabel("a47")).toBe(47)
    expect(parseOrderLabel(" 47 ")).toBe(47)
    expect(parseOrderLabel("B-001")).toBe(1000)
    for (const n of [1, 47, 999, 1000, 2500]) expect(parseOrderLabel(orderLabel(n))).toBe(n)
  })

  it("reject anything else", () => {
    expect(parseOrderLabel("")).toBeNull()
    expect(parseOrderLabel("A-000")).toBeNull()
    expect(parseOrderLabel("RCP-1")).toBeNull()
    expect(parseOrderLabel("1234")).toBeNull()
  })
})
