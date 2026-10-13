import { httpMessage, SERVER_ERROR } from "./errors"

// Better Auth answers a failed sign-in with `{ status, code, message }`. Its
// messages are developer-ish ("Invalid email or password", "USER_NOT_FOUND"),
// so the common cases get plain wording here; anything unrecognised falls
// back to the shared HTTP rules in lib/errors.ts. Pure, unit-tested.

export interface AuthFailure {
  status?: number
  code?: string
  message?: string
}

export const WRONG_EMAIL_PASSWORD = "Wrong email or password. Check them and try again."
export const WRONG_PHONE_PIN = "Wrong phone number or PIN. Check them and try again."
export const TOO_MANY_ATTEMPTS = "Too many sign-in attempts. Wait a minute and try again."

/** Message for a sign-in answer that came back with an error (the server was reached). */
export function signInErrorMessage(err: AuthFailure | null | undefined, kind: "email" | "pin"): string {
  const wrong = kind === "email" ? WRONG_EMAIL_PASSWORD : WRONG_PHONE_PIN
  if (!err) return wrong
  const code = (err.code ?? "").toUpperCase()
  const status = typeof err.status === "number" ? err.status : 0
  if (status === 429) return TOO_MANY_ATTEMPTS
  if (code === "EMAIL_NOT_VERIFIED") return "This email isn't verified yet. Open the link we emailed you, then sign in."
  if (code === "BANNED_USER" || /banned/i.test(err.message ?? "")) {
    return "This account has been switched off. Ask the owner or a manager."
  }
  if (
    status === 401 ||
    code === "INVALID_EMAIL_OR_PASSWORD" ||
    code === "INVALID_PASSWORD" ||
    code === "INVALID_EMAIL" ||
    code === "USER_NOT_FOUND" ||
    code === "CREDENTIAL_ACCOUNT_NOT_FOUND" ||
    /invalid (email|phone|password|pin)/i.test(err.message ?? "")
  ) {
    return wrong
  }
  if (status >= 500) return SERVER_ERROR
  if (status === 400 && !code) return wrong
  return httpMessage(status || 400, err.message)
}
