import { describe, it, expect } from "vitest"
import { needsMpesaCheck } from "../mpesa-check"

describe("M-Pesa sales listed in Sync issues", () => {
  it("lists a hand-confirmed sale with a code to check", () => {
    expect(needsMpesaCheck({ payment_method: "mpesa", mpesa_verified: false, mpesa_reference: "QK12ABC" })).toBe(true)
    expect(needsMpesaCheck({ payment_method: "split", mpesa_verified: false, mpesa_reference: "QK12ABC" })).toBe(true)
  })

  it("doesn't list one confirmed without a code", () => {
    expect(needsMpesaCheck({ payment_method: "mpesa", mpesa_verified: false, mpesa_reference: null })).toBe(false)
    expect(needsMpesaCheck({ payment_method: "mpesa", mpesa_reference: "   " })).toBe(false)
    expect(needsMpesaCheck({ payment_method: "split", mpesa_reference: undefined })).toBe(false)
  })

  it("never lists cash or prompt-confirmed payments", () => {
    expect(needsMpesaCheck({ payment_method: "cash", mpesa_reference: "QK12ABC" })).toBe(false)
    expect(needsMpesaCheck({ payment_method: "mpesa", mpesa_verified: true, mpesa_reference: "QK12ABC" })).toBe(false)
  })
})
