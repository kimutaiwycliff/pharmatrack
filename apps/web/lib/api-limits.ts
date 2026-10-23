// The general API rate limit (applied in proxy.ts, before any route runs).
// Per signed-in session, per device token (the Android/desktop sync), or per
// client IP for anonymous callers. Better Auth's /api/auth/* routes have their
// own limits (lib/auth/server.ts) and are skipped here.

export interface ApiTier {
  name: "default" | "heavy" | "callback" | "sync" | "health"
  limit: number
  windowSec: number
  /** What the person was doing, for the 429 message. */
  label: string
}

const tier = (name: ApiTier["name"], limit: number, label: string): ApiTier => ({ name, limit, windowSec: 60, label })

// Expensive work: whole-catalogue reads, imports/exports, reports.
const HEAVY = ["/api/products/export", "/api/inventory/import", "/api/reports", "/api/catalog/quickstart", "/api/catalog/seed", "/api/catalog/review"]
// Payment providers calling us back — generous, so a real payment is never refused.
const CALLBACKS = ["/api/webhooks", "/api/mpesa/callback"]

const under = (p: string, prefix: string) => p === prefix || p.startsWith(prefix + "/")

/** Which limit applies to an API path, or null when it isn't limited here. */
export function apiTierFor(pathname: string): ApiTier | null {
  if (!pathname.startsWith("/api/")) return null
  if (under(pathname, "/api/auth")) return null
  if (under(pathname, "/api/health")) return tier("health", 120, "health checks")
  if (CALLBACKS.some((p) => under(pathname, p))) return tier("callback", 600, "callbacks")
  if (under(pathname, "/api/sync")) return tier("sync", 600, "sync requests")
  if (HEAVY.some((p) => under(pathname, p))) return tier("heavy", 30, "reports, imports and exports")
  return tier("default", 300, "requests")
}

export function apiLimitMessage(t: ApiTier, retry: string): string {
  return t.name === "heavy"
    ? `Too many ${t.label} in a short time. Try again in ${retry}.`
    : `Too many requests — please slow down. Try again in ${retry}.`
}
