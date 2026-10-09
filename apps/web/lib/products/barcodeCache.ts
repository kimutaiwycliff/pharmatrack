import { eq } from "drizzle-orm"
import { dbAdmin, branch } from "@pharmatrack/db"
import { redis } from "@/lib/redis"

/**
 * Clear cached barcode lookups (GET /api/products/lookup) for these codes in
 * EVERY branch of the org. The lookup caches under
 * `product:<org>:<branch|->:<code>`; earlier invalidations used the
 * branch-less `product:<org>:<code>`, which never matched, so edited prices or
 * units kept scanning stale for up to the cache TTL (1h).
 */
export async function invalidateBarcodeCache(orgId: string, codes: Array<string | null | undefined>) {
  if (!redis) return
  const keys = codes.filter((c): c is string => !!c)
  if (keys.length === 0) return
  try {
    const branches = await dbAdmin().select({ id: branch.id }).from(branch).where(eq(branch.organization_id, orgId))
    const scopes = ["-", ...branches.map((b) => b.id)]
    for (const code of keys) {
      for (const scope of scopes) await redis.del(`product:${orgId}:${scope}:${code}`)
    }
  } catch {
    // best effort — the cache is optional and short-lived
  }
}
