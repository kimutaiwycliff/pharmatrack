import { describe, it, expect } from "vitest"
import { canonicalEmail, canonicalRegistrationNumber, emailDomain } from "../canonical"

describe("canonicalEmail", () => {
  it("lowercases and trims", () => {
    expect(canonicalEmail("  Jane@Pharmacy.CO.KE ")).toBe("jane@pharmacy.co.ke")
  })
  it("strips +tags for every domain", () => {
    expect(canonicalEmail("jane+trial2@pharmacy.co.ke")).toBe("jane@pharmacy.co.ke")
    expect(canonicalEmail("jane+a+b@gmail.com")).toBe("jane@gmail.com")
  })
  it("removes dots in the local part for gmail only", () => {
    expect(canonicalEmail("j.a.n.e@gmail.com")).toBe("jane@gmail.com")
    expect(canonicalEmail("j.ane@pharmacy.co.ke")).toBe("j.ane@pharmacy.co.ke")
  })
  it("maps googlemail.com to gmail.com", () => {
    expect(canonicalEmail("Jane.Doe+x@GoogleMail.com")).toBe("janedoe@gmail.com")
  })
  it("leaves something sensible for malformed input", () => {
    expect(canonicalEmail("not-an-email")).toBe("not-an-email")
  })
})

describe("emailDomain", () => {
  it("returns the lowercased domain", () => {
    expect(emailDomain("a@Mailinator.com")).toBe("mailinator.com")
    expect(emailDomain("nope")).toBe("")
  })
})

describe("canonicalRegistrationNumber", () => {
  it("uppercases and strips separators", () => {
    expect(canonicalRegistrationNumber("ppb/ret/123-24")).toBe("PPBRET12324")
    expect(canonicalRegistrationNumber(" PPB RET 123 24 ")).toBe("PPBRET12324")
  })
  it("returns null for blank input", () => {
    expect(canonicalRegistrationNumber("")).toBeNull()
    expect(canonicalRegistrationNumber("  - / ")).toBeNull()
    expect(canonicalRegistrationNumber(null)).toBeNull()
    expect(canonicalRegistrationNumber(undefined)).toBeNull()
  })
})
