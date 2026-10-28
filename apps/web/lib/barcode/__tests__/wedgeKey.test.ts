import { describe, expect, it } from "vitest"
import { parseBarcode, wedgeKeyChar, WEDGE_GS } from "@pharmatrack/core"

// What a keyboard-wedge scanner "types" for a GS1 DataMatrix whose batch (a
// variable-length field) comes before the expiry: the separator arrives as Ctrl+].
const keys = (s: string) => [...s].map((c) => (c === "|" ? { key: "]", code: "BracketRight", ctrlKey: true } : { key: c }))

describe("wedgeKeyChar", () => {
  it("turns Ctrl+] into the GS1 separator", () => {
    expect(wedgeKeyChar({ key: "]", code: "BracketRight", ctrlKey: true })).toBe(WEDGE_GS)
    expect(wedgeKeyChar({ key: "Dead", code: "BracketRight", ctrlKey: true })).toBe(WEDGE_GS)
    expect(wedgeKeyChar({ key: WEDGE_GS })).toBe(WEDGE_GS)
  })
  it("keeps plain characters and drops other shortcuts and named keys", () => {
    expect(wedgeKeyChar({ key: "]" })).toBe("]")
    expect(wedgeKeyChar({ key: "7" })).toBe("7")
    expect(wedgeKeyChar({ key: "c", ctrlKey: true })).toBeNull()
    expect(wedgeKeyChar({ key: "Shift" })).toBeNull()
    expect(wedgeKeyChar({ key: "Tab" })).toBeNull()
  })
  it("lets the parser split batch from expiry", () => {
    const raw = keys("]d20106901028075909" + "10LOT7A|" + "17271130").map(wedgeKeyChar).join("")
    const r = parseBarcode(raw)
    expect(r.gtin).toBe("6901028075909")
    expect(r.batchNumber).toBe("LOT7A")
    expect(r.expiryDate?.getFullYear()).toBe(2027)
    expect(r.expiryDate?.getMonth()).toBe(10)
  })
})
