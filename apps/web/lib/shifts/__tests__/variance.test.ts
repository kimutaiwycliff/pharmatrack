import { describe, it, expect } from "vitest"
import { varianceSeverity, VARIANCE_OK_KES, VARIANCE_SERIOUS_KES } from "../variance"

describe("varianceSeverity", () => {
  it("returns null for null/undefined (no closing figure yet)", () => {
    expect(varianceSeverity(null)).toBeNull()
    expect(varianceSeverity(undefined)).toBeNull()
  })

  it("treats an exact match as ok", () => {
    expect(varianceSeverity(0)).toBe("ok")
  })

  it("treats small over/short amounts as ok, on both sides of zero", () => {
    expect(varianceSeverity(VARIANCE_OK_KES - 1)).toBe("ok")
    expect(varianceSeverity(-(VARIANCE_OK_KES - 1))).toBe("ok")
  })

  it("flags moderate variance as warn, right at the OK boundary", () => {
    expect(varianceSeverity(VARIANCE_OK_KES)).toBe("warn")
    expect(varianceSeverity(-VARIANCE_OK_KES)).toBe("warn")
    expect(varianceSeverity(VARIANCE_SERIOUS_KES - 1)).toBe("warn")
  })

  it("flags large variance as serious, right at the SERIOUS boundary", () => {
    expect(varianceSeverity(VARIANCE_SERIOUS_KES)).toBe("serious")
    expect(varianceSeverity(-VARIANCE_SERIOUS_KES)).toBe("serious")
    expect(varianceSeverity(VARIANCE_SERIOUS_KES * 10)).toBe("serious")
  })
})
