import { describe, expect, it } from "vitest"
import { varianceLabel } from "../variance"

describe("varianceLabel", () => {
  it("calls small differences either way Balanced", () => {
    expect(varianceLabel(0)).toEqual({ kind: "balanced", label: "Balanced", status: "ok" })
    expect(varianceLabel(-49.99).label).toBe("Balanced")
    expect(varianceLabel(49).label).toBe("Balanced")
  })

  it("labels counted-more-than-expected as Over and less as Short", () => {
    expect(varianceLabel(120)).toEqual({ kind: "over", label: "Over", status: "warning" })
    expect(varianceLabel(-120)).toEqual({ kind: "short", label: "Short", status: "warning" })
  })

  it("escalates big differences to danger", () => {
    expect(varianceLabel(-500).status).toBe("danger")
    expect(varianceLabel(800).status).toBe("danger")
  })

  it("shows still-open shifts as Open", () => {
    expect(varianceLabel(null).label).toBe("Open")
    expect(varianceLabel(0, false).kind).toBe("open")
  })
})
