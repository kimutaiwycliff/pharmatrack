import { NextResponse } from "next/server"
import { and, eq, lt, sql } from "drizzle-orm"
import { idempotency_key, type DrizzleDB } from "@pharmatrack/db"
import { IDEMPOTENCY_HEADER } from "./idempotency-header"

// Idempotency keys for stock-creating writes (migration 031). A client sends
// `Idempotency-Key` once per submission and reuses it on retry. The key is
// claimed inside the route's own withTenant() transaction, before the write:
//   - first request: the claim inserts, the write runs, the answer is stored
//     with it — all one commit, or all rolled back on failure;
//   - a retry after that commit replays the stored answer (no second batch/PO);
//   - two copies in flight at once: the second's insert waits on the primary
//     key until the first commits, then replays its answer.
// No header → the route behaves exactly as before (older app versions).

export { IDEMPOTENCY_HEADER }
const KEY_RE = /^[A-Za-z0-9_.:-]{8,100}$/
const KEEP_DAYS = 7

export interface IdempotencyClaim {
  organizationId: string
  key: string
  /** What the key was used for, e.g. "batch.create" or `po.receive:${id}`. */
  scope: string
}

/** Reads the optional header. A malformed key is a 400 rather than silently ignored. */
export function readIdempotencyKey(request: Request): { key: string | null } | { error: NextResponse } {
  const raw = request.headers.get(IDEMPOTENCY_HEADER)
  if (raw == null || raw === "") return { key: null }
  if (!KEY_RE.test(raw)) {
    return { error: NextResponse.json({ error: "Invalid request ID. Please try again." }, { status: 400 }) }
  }
  return { key: raw }
}

/** The claim for a route, or null when the client sent no key. */
export function claimFor(organizationId: string, key: string | null, scope: string): IdempotencyClaim | null {
  return key ? { organizationId, key, scope } : null
}

export interface IdempotentResult<B, X> {
  status: number
  body: B
  /** Route-only data for after the commit (e.g. cache keys); absent on a replay. */
  after?: X
  replayed: boolean
}

/**
 * Runs `work` at most once per key. Call inside withTenant(); `work` must use
 * the same `db` so its writes and the stored answer commit together. With no
 * claim (no header) it just runs `work`.
 */
export async function idempotent<B, X = undefined>(
  db: DrizzleDB,
  claim: IdempotencyClaim | null,
  work: () => Promise<{ status: number; body: B; after?: X }>,
): Promise<IdempotentResult<B | { error: string }, X>> {
  if (!claim) return { ...(await work()), replayed: false }

  const inserted = await db.insert(idempotency_key)
    .values({ organization_id: claim.organizationId, key: claim.key, scope: claim.scope })
    .onConflictDoNothing()
    .returning({ key: idempotency_key.key })

  if (inserted.length === 0) {
    const [row] = await db.select().from(idempotency_key)
      .where(and(eq(idempotency_key.organization_id, claim.organizationId), eq(idempotency_key.key, claim.key)))
      .limit(1)
    if (row && row.scope !== claim.scope) {
      return { status: 422, body: { error: "This request ID was already used for something else. Please try again." }, replayed: true }
    }
    if (!row || row.status_code == null) {
      return { status: 409, body: { error: "This request is still being saved. Wait a moment, then refresh." }, replayed: true }
    }
    return { status: row.status_code, body: row.response as B, replayed: true }
  }

  const result = await work()
  await db.update(idempotency_key)
    .set({ status_code: result.status, response: result.body as unknown })
    .where(and(eq(idempotency_key.organization_id, claim.organizationId), eq(idempotency_key.key, claim.key)))

  // Occasional housekeeping: retries happen within minutes, so a week is ample.
  if (Math.random() < 0.05) {
    await db.delete(idempotency_key).where(and(
      eq(idempotency_key.organization_id, claim.organizationId),
      lt(idempotency_key.created_at, sql`now() - make_interval(days => ${KEEP_DAYS})`),
    ))
  }
  return { ...result, replayed: false }
}
