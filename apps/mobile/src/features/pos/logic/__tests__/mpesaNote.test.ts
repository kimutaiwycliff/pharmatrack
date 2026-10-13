import { describe, expect, it } from "vitest"
import { mpesaUnavailableNote } from "../mpesaNote"

describe("mpesaUnavailableNote", () => {
  it("is silent when available or in the Offline Edition", () => {
    expect(mpesaUnavailableNote({ available: true, planAllowed: true, configured: true }, false)).toBeNull()
    expect(mpesaUnavailableNote(null, true)).toBeNull()
  })
  it("explains each reason", () => {
    expect(mpesaUnavailableNote(null, false)).toMatch(/checking/i)
    expect(mpesaUnavailableNote({ available: false, planAllowed: false, configured: false, failed: true }, false)).toMatch(/couldn't check/i)
    expect(mpesaUnavailableNote({ available: false, planAllowed: false, configured: true }, false)).toMatch(/plan/i)
    expect(mpesaUnavailableNote({ available: false, planAllowed: true, configured: false }, false)).toMatch(/set up/i)
  })
})
