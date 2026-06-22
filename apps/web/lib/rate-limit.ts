import IORedis from "ioredis"

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

/** Best-effort client IP from proxy headers (Caddy sets X-Forwarded-For). */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for")
  if (xff) return xff.split(",")[0]!.trim()
  return req.headers.get("x-real-ip")?.trim() || "unknown"
}
