import { describe, it, expect } from "vitest"
import { DISPOSABLE_EMAIL_DOMAINS, isDisposableEmail } from "../disposable-domains"

describe("isDisposableEmail", () => {
  it("flags well-known throwaway providers", () => {
    for (const e of ["x@mailinator.com", "x@guerrillamail.com", "x@10minutemail.com", "x@temp-mail.org", "x@yopmail.com", "x@trashmail.com", "x@sharklasers.com"]) {
      expect(isDisposableEmail(e)).toBe(true)
    }
  })
  it("is case-insensitive and matches subdomains", () => {
    expect(isDisposableEmail("Jane@MAILINATOR.COM")).toBe(true)
    expect(isDisposableEmail("jane@inbox.mailinator.com")).toBe(true)
  })
  it("allows real mailbox providers and business domains", () => {
    for (const e of ["jane@gmail.com", "jane@yahoo.com", "jane@outlook.com", "jane@icloud.com", "jane@pharmacy.co.ke", "jane@safaricom.co.ke"]) {
      expect(isDisposableEmail(e)).toBe(false)
    }
  })
  it("does not match lookalike suffixes", () => {
    expect(isDisposableEmail("jane@notyopmail.com.ke")).toBe(false)
    expect(isDisposableEmail("jane@mymailinator.com")).toBe(false)
  })
  it("handles malformed input", () => {
    expect(isDisposableEmail("no-at-sign")).toBe(false)
    expect(isDisposableEmail("x@")).toBe(false)
  })
  it("never lists a mainstream provider", () => {
    for (const d of ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com", "proton.me", "protonmail.com"]) {
      expect(DISPOSABLE_EMAIL_DOMAINS.has(d)).toBe(false)
    }
  })
})
