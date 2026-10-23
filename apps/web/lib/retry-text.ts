// Client-safe (no Redis import): used by 429 messages on the server and the
// sign-in screens.

/** "30 seconds", "4 minutes", "1 hour" — for messages that say how long to wait. */
export function retryText(seconds: number): string {
  const s = Math.max(1, Math.ceil(seconds))
  if (s < 60) return `${s} second${s === 1 ? "" : "s"}`
  const m = Math.ceil(s / 60)
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"}`
  const h = Math.ceil(m / 60)
  return `${h} hour${h === 1 ? "" : "s"}`
}

/**
 * What a sign-in screen says for a failed attempt. A 429 names the wait: the
 * server's own lockout text when it sent one ("Too many wrong PINs…"), else a
 * per-device limit message built from Retry-After.
 */
export function signInErrorMessage(status: number | undefined, serverMessage: string | undefined | null, retryAfterSec: number, fallback: string): string {
  if (status === 429) {
    if (serverMessage && /^Too many (wrong|failed)/.test(serverMessage)) return serverMessage
    return `Too many sign-in attempts from this device. Try again in ${retryText(retryAfterSec || 60)}.`
  }
  return serverMessage || fallback
}
