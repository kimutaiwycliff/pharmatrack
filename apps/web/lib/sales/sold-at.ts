// When a sale happened. A sale queued by an offline browser reaches the server
// later (maybe the next day), so POST /api/sales accepts the time it was
// actually sold — only together with its offline_reference, never in the
// future, and at most 30 days back. Anything else is dated "now".

export const SOLD_AT_MAX_AGE_MS = 30 * 86_400_000

export function saleTimestamp(offlineReference: string | null | undefined, soldAt: string | undefined, now = Date.now()): Date {
  if (!offlineReference || !soldAt) return new Date(now)
  const t = new Date(soldAt).getTime()
  if (!Number.isFinite(t) || t > now || t < now - SOLD_AT_MAX_AGE_MS) return new Date(now)
  return new Date(t)
}
