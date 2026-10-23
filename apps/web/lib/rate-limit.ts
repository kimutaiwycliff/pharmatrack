import IORedis from "ioredis"
import { retryText } from "@/lib/retry-text"

// Lightweight fixed-window rate limiter for custom (non-Better-Auth) routes.
// Uses Redis (atomic INCR + EXPIRE) when REDIS_URL is set, so limits hold across
// restarts and any future second instance; falls back to a per-process in-memory
// window otherwise. Better Auth's own endpoints are limited separately via its
// built-in rateLimit config (see lib/auth/server.ts).

let _redis: IORedis | null | undefined
function redis(): IORedis | null {
  if (_redis !== undefined) return _redis
  const url = process.env.REDIS_URL
  if (!url || !url.trim()) return (_redis = null)
  try {
    const c = new IORedis(url, { maxRetriesPerRequest: 1, enableOfflineQueue: false, lazyConnect: false })
    c.on("error", () => {}) // never let a cache hiccup take down a request
    return (_redis = c)
  } catch {
    return (_redis = null)
  }
}

// Per-process fallback store. Pruned opportunistically so it can't grow forever.
const mem = new Map<string, { count: number; resetAt: number }>()
function memHit(key: string, limit: number, windowSec: number): RateLimitResult {
  const now = Date.now()
  if (mem.size > 5000) for (const [k, v] of mem) if (v.resetAt <= now) mem.delete(k)
  const e = mem.get(key)
  if (!e || e.resetAt <= now) {
    mem.set(key, { count: 1, resetAt: now + windowSec * 1000 })
    return { ok: true, remaining: limit - 1, retryAfter: 0 }
  }
  e.count++
  const ok = e.count <= limit
  return { ok, remaining: Math.max(0, limit - e.count), retryAfter: ok ? 0 : Math.ceil((e.resetAt - now) / 1000) }
}

export interface RateLimitResult {
  ok: boolean
  remaining: number
  /** Seconds until the window resets (only meaningful when !ok). */
  retryAfter: number
}

/** Count one hit against `key`; allow up to `limit` per `windowSec` window. */
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<RateLimitResult> {
  const k = `rl:${key}`
  const r = redis()
  if (r) {
    try {
      const count = await r.incr(k)
      if (count === 1) await r.expire(k, windowSec)
      const ok = count <= limit
      const ttl = ok ? 0 : Math.max(1, await r.ttl(k))
      return { ok, remaining: Math.max(0, limit - count), retryAfter: ttl }
    } catch {
      /* fall back to memory on Redis error */
    }
  }
  return memHit(k, limit, windowSec)
}

/**
 * Better Auth's rate-limit storage (lib/auth/server.ts → rateLimit.customStorage):
 * `consume` counts each request atomically with the same Redis INCR as above,
 * so limits survive restarts. get/set are Better Auth's legacy non-atomic path,
 * only used if consume were missing — kept in memory.
 */
const legacy = new Map<string, { key: string; count: number; lastRequest: number }>()
export const authRateLimitStorage = {
  async consume(key: string, rule: { window: number; max: number }) {
    const r = await rateLimit(`auth:${key}`, rule.max, rule.window)
    return { allowed: r.ok, retryAfter: r.ok ? null : Math.max(1, r.retryAfter) }
  },
  async get(key: string) {
    return legacy.get(key) ?? null
  },
  async set(key: string, value: { key: string; count: number; lastRequest: number }) {
    legacy.set(key, value)
  },
}

export { retryText } from "@/lib/retry-text"

/**
 * The one 429 response every limited route returns: a message written for
 * people (it says how long to wait), the seconds in `retry_after`, and the
 * standard Retry-After header (plus X-Retry-After, which Better Auth uses).
 */
export function tooManyRequests(message: string, retryAfter: number): Response {
  const secs = String(Math.max(1, Math.ceil(retryAfter)))
  return new Response(JSON.stringify({ error: message, message, retry_after: Number(secs) }), {
    status: 429,
    headers: { "content-type": "application/json", "retry-after": secs, "x-retry-after": secs },
  })
}

// ── Per-account lockout ──────────────────────────────────────────────────────
// Per-IP limits don't stop someone rotating IPs against one account (a 4-digit
// till PIN has only 10,000 values). These count failures per account and lock
// it for a while once too many pile up, whatever IP they come from.

const memLocks = new Map<string, number>() // key → unlock time (ms)

/** Seconds left on a lock, or 0. */
export async function lockRemaining(scope: string, id: string): Promise<number> {
  const k = `lock:${scope}:${id}`
  const r = redis()
  if (r) {
    try {
      const ttl = await r.ttl(k)
      return ttl > 0 ? ttl : 0
    } catch {
      /* memory below */
    }
  }
  const until = memLocks.get(k) ?? 0
  return until > Date.now() ? Math.ceil((until - Date.now()) / 1000) : 0
}

/**
 * Record one failure. After `max` failures inside `windowSec`, lock the account
 * for `lockSec`. Returns whether this failure caused (or met) a lock.
 */
export async function recordFailure(scope: string, id: string, opts: { max: number; windowSec: number; lockSec: number }): Promise<{ locked: boolean; lockSec: number }> {
  const fails = await rateLimit(`fail:${scope}:${id}`, opts.max - 1, opts.windowSec)
  if (fails.ok) return { locked: false, lockSec: 0 }
  const k = `lock:${scope}:${id}`
  const r = redis()
  if (r) {
    try {
      await r.set(k, "1", "EX", opts.lockSec)
      await r.del(`rl:fail:${scope}:${id}`)
      return { locked: true, lockSec: opts.lockSec }
    } catch {
      /* memory below */
    }
  }
  memLocks.set(k, Date.now() + opts.lockSec * 1000)
  mem.delete(`rl:fail:${scope}:${id}`)
  return { locked: true, lockSec: opts.lockSec }
}

/** A successful sign-in clears the failure count. */
export async function clearFailures(scope: string, id: string): Promise<void> {
  const r = redis()
  if (r) {
    try {
      await r.del(`rl:fail:${scope}:${id}`)
      return
    } catch {
      /* memory below */
    }
  }
  mem.delete(`rl:fail:${scope}:${id}`)
}

/** Best-effort client IP from proxy headers (Caddy sets X-Forwarded-For). */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for")
  if (xff) return xff.split(",")[0]!.trim()
  return req.headers.get("x-real-ip")?.trim() || "unknown"
}
