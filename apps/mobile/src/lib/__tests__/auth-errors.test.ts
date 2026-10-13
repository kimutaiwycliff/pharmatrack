import { describe, expect, it } from "vitest"
import { signInErrorMessage, TOO_MANY_ATTEMPTS, WRONG_EMAIL_PASSWORD, WRONG_PHONE_PIN } from "../auth-errors"
import { SERVER_ERROR } from "../errors"

describe("signInErrorMessage", () => {
  it("maps bad credentials to plain wording per sign-in kind", () => {
    expect(signInErrorMessage({ status: 401, code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password" }, "email")).toBe(
      WRONG_EMAIL_PASSWORD,
    )
    expect(signInErrorMessage({ status: 401, message: "Invalid phone or PIN" }, "pin")).toBe(WRONG_PHONE_PIN)
    expect(signInErrorMessage({ status: 400, code: "USER_NOT_FOUND" }, "email")).toBe(WRONG_EMAIL_PASSWORD)
    expect(signInErrorMessage(null, "pin")).toBe(WRONG_PHONE_PIN)
  })

  it("keeps meaningful cases distinct", () => {
    expect(signInErrorMessage({ status: 429, message: "Too many requests" }, "pin")).toBe(TOO_MANY_ATTEMPTS)
    expect(signInErrorMessage({ status: 403, code: "EMAIL_NOT_VERIFIED", message: "Email not verified" }, "email")).toMatch(/verified/)
    expect(signInErrorMessage({ status: 403, code: "BANNED_USER", message: "You have been banned" }, "email")).toMatch(/switched off/)
    expect(signInErrorMessage({ status: 500, message: "Could not start session" }, "pin")).toBe(SERVER_ERROR)
  })

  it("passes through a human server sentence for other 4xx answers", () => {
    expect(signInErrorMessage({ status: 403, message: "Your pharmacy's subscription is suspended" }, "email")).toBe(
      "Your pharmacy's subscription is suspended",
    )
  })
})
