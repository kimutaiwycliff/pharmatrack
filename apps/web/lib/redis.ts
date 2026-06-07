import { Redis } from "@upstash/redis"

function create(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  // Treat the example placeholder as "not configured".
  if (!url || !token || url === "https://xxx.upstash.io") return null
  try {
    return new Redis({ url, token })
  } catch {
    return null
  }
}

/**
 * Shared cache client. `null` when Upstash isn't configured — callers must
 * treat the cache as optional and fall back to the database.
 *
 * Swappable: to self-host, point this at a standard Redis via a REST shim
 * (e.g. Upstash's `serverless-redis-http` / Hono proxy) or replace with an
 * ioredis-backed adapter exposing the same get/set/del methods.
 */
export const redis: Redis | null = create()
