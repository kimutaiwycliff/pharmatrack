import { APIError } from "better-auth/api"
import { clearFailures, lockRemaining, recordFailure, retryText } from "@/lib/rate-limit"

// Per-account sign-in lockouts (on top of Better Auth's per-IP limits in
// lib/auth/server.ts). A till PIN has only 10,000 values, so it locks sooner.

export const LOCKOUT = {
  pin: { max: 5, windowSec: 15 * 60, lockSec: 15 * 60 },
  password: { max: 10, windowSec: 15 * 60, lockSec: 15 * 60 },
} as const

export type LockScope = keyof typeof LOCKOUT

export function lockedMessage(scope: LockScope, seconds: number): string {
  return scope === "pin"
    ? `Too many wrong PINs. This PIN is locked for ${retryText(seconds)} — sign in with your email and password, or ask your manager.`
    : `Too many failed sign-in attempts for this account. Try again in ${retryText(seconds)}, or reset your password.`
}

/** A 429 Better Auth sends as-is, with the wait in Retry-After. */
export function lockedError(scope: LockScope, seconds: number): APIError {
  const s = String(Math.max(1, Math.ceil(seconds)))
  return new APIError("TOO_MANY_REQUESTS", { message: lockedMessage(scope, seconds), code: "ACCOUNT_LOCKED" }, { "retry-after": s, "x-retry-after": s })
}

/** Throws when the account is currently locked. */
export async function assertNotLocked(scope: LockScope, id: string): Promise<void> {
  const left = await lockRemaining(scope, id)
  if (left > 0) throw lockedError(scope, left)
}

/** Count a failed attempt; returns the lock length when this one tipped it over. */
export async function failedAttempt(scope: LockScope, id: string): Promise<number> {
  const r = await recordFailure(scope, id, LOCKOUT[scope])
  return r.locked ? r.lockSec : 0
}

export const succeeded = (scope: LockScope, id: string) => clearFailures(scope, id)
