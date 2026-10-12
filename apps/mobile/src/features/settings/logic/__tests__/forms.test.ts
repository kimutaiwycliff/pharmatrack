import { describe, expect, it } from "vitest"
import {
  hasErrors, orgPayload, phoneError, pinError, validateOrgForm, validatePasswordForm, validatePinForm, validateProfileForm,
} from "../forms"

describe("pinError", () => {
  it("online: exactly 4 digits, not trivial (server's validatePin)", () => {
    expect(pinError("12a4", { offline: false })).toBe("PIN must be exactly 4 digits")
    expect(pinError("12345", { offline: false })).toBe("PIN must be exactly 4 digits")
    expect(pinError("0000", { offline: false })).toBe("Choose a less predictable PIN")
    expect(pinError("4321", { offline: false })).toBe("Choose a less predictable PIN")
    expect(pinError("4829", { offline: false })).toBeNull()
  })
  it("offline: 4-8 digits", () => {
    expect(pinError("123", { offline: true })).toBe("PIN must be 4-8 digits")
    expect(pinError("12345678", { offline: true })).toBeNull()
  })
})

describe("validatePinForm", () => {
  it("checks the confirmation and (online) the account password", () => {
    expect(validatePinForm({ pin: "4829", confirm: "4828", password: "" }, { offline: false })).toEqual({
      confirm: "PINs do not match",
      password: "Enter your account password to confirm",
    })
    expect(validatePinForm({ pin: "4829", confirm: "4829", password: "" }, { offline: true })).toEqual({})
  })
})

describe("validatePasswordForm", () => {
  it("mirrors web's messages", () => {
    expect(validatePasswordForm({ current: "", next: "short", confirm: "short" })).toEqual({
      current: "Enter your current password",
      next: "New password must be at least 8 characters",
    })
    expect(validatePasswordForm({ current: "old", next: "longenough", confirm: "different" })).toEqual({
      confirm: "Passwords do not match",
    })
    expect(hasErrors(validatePasswordForm({ current: "old", next: "longenough", confirm: "longenough" }))).toBe(false)
  })
})

describe("phoneError", () => {
  it("accepts every Kenyan pattern", () => {
    for (const p of ["0712345678", "712345678", "254712345678", "+254 712 345 678", "0112345678"]) {
      expect(phoneError(p, { required: true })).toBeNull()
    }
  })
  it("rejects junk; blank only when required", () => {
    expect(phoneError("0712", { required: false })).toBeTruthy()
    expect(phoneError("", { required: false })).toBeNull()
    expect(phoneError("  ", { required: true })).toBe("Enter a phone number")
  })
  it("lets a non-Kenyan E.164 number through", () => {
    expect(phoneError("+256712345678", { required: false })).toBeNull()
  })
})

describe("profile + organisation", () => {
  it("requires a 2+ character name", () => {
    expect(validateProfileForm({ fullName: " J ", phone: "" })).toEqual({ fullName: "Enter your full name" })
    expect(validateProfileForm({ fullName: "Jane", phone: "" }, { phoneRequired: true })).toEqual({ phone: "Enter a phone number" })
    expect(validateOrgForm({ name: "A", registrationNumber: "", phone: "", email: "bad", address: "" })).toEqual({
      name: "Enter the pharmacy name",
      email: "Enter a valid email address",
    })
  })
  it("sends blank optional organisation fields as undefined (server rejects an empty email)", () => {
    expect(orgPayload({ name: " Afya ", registrationNumber: "", phone: " 0712345678 ", email: "", address: "" })).toEqual({
      name: "Afya",
      registration_number: undefined,
      phone: "0712345678",
      email: undefined,
      address: undefined,
    })
  })
})
