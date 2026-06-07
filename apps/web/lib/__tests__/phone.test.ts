import { describe, it, expect } from "vitest"
import { formatPhone, toE164 } from "../phone"

describe("formatPhone (Kenyan MSISDN)", () => {
  it("converts 0712345678 → 254712345678", () => {
    expect(formatPhone("0712345678")).toBe("254712345678")
  })

  it("keeps 254712345678 unchanged", () => {
    expect(formatPhone("254712345678")).toBe("254712345678")
  })

  it("prefixes a bare 9-digit number", () => {
    expect(formatPhone("712345678")).toBe("254712345678")
  })

  it("strips spaces, dashes and plus signs", () => {
    expect(formatPhone("+254 712-345 678")).toBe("254712345678")
    expect(formatPhone("0712 345 678")).toBe("254712345678")
  })
})

describe("toE164", () => {
  it("adds a leading + to the MSISDN", () => {
    expect(toE164("0712345678")).toBe("+254712345678")
    expect(toE164("254712345678")).toBe("+254712345678")
  })
})
