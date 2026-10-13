import { describe, expect, it } from "vitest"
import { refusalMessage } from "../topUp"

describe("refusalMessage", () => {
  it("says the connection is the problem when the top-up failed", () => {
    expect(refusalMessage({ offlineEdition: false, outcome: "network", name: "Amoxil", available: 0 })).toMatch(/none left on this device.*check your connection/i)
  })
  it("tells an offline cashier to connect", () => {
    expect(refusalMessage({ offlineEdition: false, outcome: "offline", name: "Amoxil", available: 2 })).toBe("Only 2 of Amoxil left on this device. Connect to the internet to get more.")
  })
  it("says the branch is out when the server had nothing more", () => {
    expect(refusalMessage({ offlineEdition: false, outcome: "none", name: "Amoxil", available: 0 })).toBe("Amoxil is out of stock for this branch")
  })
  it("Offline Edition talks about stock only", () => {
    expect(refusalMessage({ offlineEdition: true, outcome: "skipped", name: "Amoxil", available: 0 })).toBe("Amoxil is out of stock")
  })
})
