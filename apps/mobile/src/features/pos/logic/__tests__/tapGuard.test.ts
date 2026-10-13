import { describe, expect, it } from "vitest"
import { createTapGuard } from "../tapGuard"

describe("createTapGuard", () => {
  it("lets the first tap through and drops repeats inside the window", () => {
    let t = 1000
    const allow = createTapGuard(600, () => t)
    expect(allow()).toBe(true)
    t += 200
    expect(allow()).toBe(false)
    t += 600
    expect(allow()).toBe(true)
  })
})
