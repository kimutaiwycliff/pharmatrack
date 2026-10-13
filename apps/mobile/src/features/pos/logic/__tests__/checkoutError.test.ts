import { describe, expect, it } from "vitest"
import { checkoutErrorMessage, SALE_NOT_SAVED } from "../checkoutError"

class FakeAllowanceError extends Error {
  constructor(public productId: string, public productName: string, public available: number) {
    super(`Only ${available} of ${productName} left on this device`)
  }
}

describe("checkoutErrorMessage", () => {
  it("keeps the allowance sentence and says what to do", () => {
    expect(checkoutErrorMessage(new FakeAllowanceError("p", "Amoxil", 2))).toBe("Only 2 of Amoxil left on this device. Lower the quantity in the cart and try again.")
  })
  it("rewrites the Offline Edition stock error", () => {
    expect(checkoutErrorMessage(new Error("Insufficient stock for Amoxil 500mg: need 5, only 2 available"))).toBe(
      "Not enough Amoxil 500mg in stock. Lower the quantity in the cart and try again.",
    )
  })
  it("never shows raw SQLite / developer text", () => {
    expect(checkoutErrorMessage(new Error("SQLITE_CONSTRAINT: UNIQUE constraint failed: sales.receipt_number"))).not.toMatch(/SQLITE|constraint/i)
    expect(checkoutErrorMessage(new TypeError("undefined is not a function"))).toBe(SALE_NOT_SAVED)
  })
})
