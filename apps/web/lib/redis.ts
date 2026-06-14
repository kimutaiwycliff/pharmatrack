import { Redis as UpstashRedis } from "@upstash/redis"
import IORedis from "ioredis"

/**
 * Minimal cache interface the app relies on. `null` means "no cache
 * configured" — every caller treats the cache as optional and falls back to
 * the database, so the app runs fine without Redis at all.
 */
export interface CacheClient {
  get<T>(key: string): Promise<T | null>
  set(key: string, value: unknown, opts?: { ex?: number }): Promise<void>
  del(key: string): Promise<void>
}

// Self-hosted / standard Redis over TCP (REDIS_URL=redis://host:6379).
function createIORedis(url: string): CacheClient {
  const client = new IORedis(url, {
    maxRetriesPerRequest: 1,
    // Never let a cache hiccup block a request — fail fast and fall back to DB.
    enableOfflineQueue: false,
    retryStrategy: (times) => Math.min(times * 200, 2000),
  })
  client.on("error", () => {}) // swallow; callers tolerate a missing cache
  return {
    async get<T>(key: string): Promise<T | null> {
      const raw = await client.get(key)
      if (raw == null) return null
      try {
        return JSON.parse(raw) as T
      } catch {
        return raw as unknown as T
      }
    },
    async set(key, value, opts) {
      const raw = typeof value === "string" ? value : JSON.stringify(value)
      if (opts?.ex) await client.set(key, raw, "EX", opts.ex)
      else await client.set(key, raw)
    },
    async del(key) {
      await client.del(key)
    },
  }
}

// Managed Upstash over HTTP (UPSTASH_REDIS_REST_URL/TOKEN). Serializes JSON itself.
function createUpstash(url: string, token: string): CacheClient {
  const client = new UpstashRedis({ url, token })
  return {
    get: <T>(key: string) => client.get<T>(key),
    set: async (key, value, opts) => {
      await client.set(key, value, opts?.ex ? { ex: opts.ex } : undefined)
    },
    del: async (key) => {
      await client.del(key)
    },
  }
}

function create(): CacheClient | null {
  // Prefer a standard/self-hosted Redis when present (single-VM deploys).
  const redisUrl = process.env.REDIS_URL
  if (redisUrl && redisUrl.trim()) {
    try {
      return createIORedis(redisUrl)
    } catch {
      return null
    }
  }
  // Otherwise use managed Upstash if configured.
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token || url === "https://xxx.upstash.io") return null
  try {
    return createUpstash(url, token)
  } catch {
    return null
  }
}

/**
 * Shared cache client, or `null` when neither REDIS_URL nor Upstash is set.
 * Callers must treat it as optional (`if (redis) …`) and fall back to the DB.
 */
export const redis: CacheClient | null = create()
