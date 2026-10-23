// PIN lockout policy shared by every on-device PIN check (offline cached
// sessions in device-users.ts, roster switching + manager override in
// lib/sync/roster.ts): 5 wrong PINs lock that person out for 15 minutes.

export const MAX_FAILED_ATTEMPTS = 5
export const LOCKOUT_MS = 15 * 60 * 1000

export interface LockoutState {
  failedAttempts: number
  /** epoch ms, or null when not locked */
  lockedUntil: number | null
}

/** Minutes left on an active lockout, or 0 when the PIN may be tried. */
export function lockoutMinutesLeft(s: LockoutState, now: number): number {
  if (s.lockedUntil == null || s.lockedUntil <= now) return 0
  return Math.ceil((s.lockedUntil - now) / 60000)
}

export function afterPinAttempt(s: LockoutState, ok: boolean, now: number): LockoutState {
  if (ok) return { failedAttempts: 0, lockedUntil: null }
  // A lockout that already expired starts a fresh count.
  const prior = s.lockedUntil != null && s.lockedUntil <= now ? 0 : s.failedAttempts
  const failedAttempts = prior + 1
  return {
    failedAttempts,
    lockedUntil: failedAttempts >= MAX_FAILED_ATTEMPTS ? now + LOCKOUT_MS : null,
  }
}
