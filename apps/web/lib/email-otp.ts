import IORedis from "ioredis"
import { randomInt } from "node:crypto"

// Short-lived email verification codes for self-serve signup. Proves the person
// controls the email before a tenant is created (curbs fake-trial abuse). Stored
// in Redis (shared, survives restarts) with a per-process in-memory fallback.

const TTL_SEC = 600 // 10 minutes
const key = (email: string) => `signup-otp:${email.trim().toLowerCase()}`

let _redis: IORedis | null | undefined
function redis(): IORedis | null {
  if (_redis !== undefined) return _redis
  const url = process.env.REDIS_URL
  if (!url || !url.trim()) return (_redis = null)
  try {
    // Offline queue ON so a command issued before the connection is ready waits
    // (and reliably hits Redis) instead of throwing into the memory fallback —
    // which would split create vs verify across backends.
    const c = new IORedis(url, { maxRetriesPerRequest: 2 })
    c.on("error", () => {})
    return (_redis = c)
  } catch {
    return (_redis = null)
  }
}

const mem = new Map<string, { code: string; exp: number }>()

/** Generate, store and return a 6-digit code for `email`. */
export async function createSignupOtp(email: string): Promise<string> {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0")
  const k = key(email)
  const r = redis()
  if (r) {
    try { await r.set(k, code, "EX", TTL_SEC); return code } catch { /* fall through */ }
  }
  mem.set(k, { code, exp: Date.now() + TTL_SEC * 1000 })
  return code
}

/** True if `code` matches the stored OTP for `email`; consumes it on success. */
export async function verifySignupOtp(email: string, code: string): Promise<boolean> {
  const k = key(email)
  const r = redis()
  if (r) {
    try {
      const stored = await r.get(k)
      if (stored) {
        if (stored === code) { await r.del(k); return true }
        return false // a code exists in Redis but doesn't match
      }
      // No code in Redis → fall through to the memory store (covers a code that
      // was written to memory during a cold Redis connection).
    } catch { /* fall through to memory */ }
  }
  const e = mem.get(k)
  if (e && e.exp > Date.now() && e.code === code) { mem.delete(k); return true }
  return false
}
