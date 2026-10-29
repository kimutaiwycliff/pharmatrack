import { NextResponse, type NextRequest } from "next/server"
import { getSessionCookie } from "better-auth/cookies"
import { createHash } from "node:crypto"
import { apiLimitMessage, apiTierFor } from "@/lib/api-limits"
import { clientIp, rateLimit, retryText, tooManyRequests } from "@/lib/rate-limit"

// Next 16 middleware (exported as `proxy`, Node.js runtime). It does an
// OPTIMISTIC session-cookie check (no DB) to gate routes, and applies the
// general API rate limit (lib/api-limits.ts; one Redis INCR per API call). Real session validation + the
// first-run /setup and role-based routing happen in server components (which can
// hit the DB). See ADR-002.
//
// Protected areas: signed-out visitors are redirected to /login when they hit one
// of these prefixes. This is an OPTIMISTIC fast-path only — every route group also
// enforces auth in its server components (getSession / requireRole), which is the
// real boundary. We gate by an explicit allow-list (rather than "redirect anything
// unknown") so that genuinely non-existent paths fall through to the branded 404
// for everyone, instead of bouncing anonymous visitors to /login. A new protected
// area must be added here to get the fast redirect; until then its server guard
// still protects it.
const PROTECTED_PAGE_PREFIXES = [
  "/home", "/dashboard", "/pos", "/platform", "/onboarding",
  "/appointments", "/inventory", "/prescriptions", "/products",
  "/reports", "/settings", "/shifts", "/staff", "/suppliers", "/getting-started",
]

// API routes that self-authenticate (Better Auth, webhooks/callbacks, cron, health,
// first-run). Everything else under /api is treated as protected.
const PUBLIC_API_PREFIXES = [
  "/api/auth", "/api/health", "/api/webhooks", "/api/mpesa", "/api/cron", "/api/setup", "/api/signup", "/api/contact",
  "/api/desktop", // installer downloads + updater manifest - anonymous marketing-site visitors need these
  "/api/sync", // registered devices authenticate with their own device token (lib/sync/device-auth.ts), not a session cookie
  "/api/device-pairing", // a blocked device asks for approval before anyone is signed in (ADR-018); its request secret is the credential
]

const underPrefix = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(prefix + "/")

const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 32)

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const sessionToken = getSessionCookie(request)
  const hasSession = !!sessionToken

  // General API limit: per session, else per device token (sync), else per IP.
  const tier = apiTierFor(pathname)
  if (tier) {
    const auth = request.headers.get("authorization")
    const who = sessionToken ? `s:${hash(sessionToken)}` : auth ? `t:${hash(auth)}` : `ip:${clientIp(request)}`
    const r = await rateLimit(`api:${tier.name}:${who}`, tier.limit, tier.windowSec)
    if (!r.ok) return tooManyRequests(apiLimitMessage(tier, retryText(r.retryAfter)), r.retryAfter)
  }

  const isProtectedPage = PROTECTED_PAGE_PREFIXES.some((p) => underPrefix(pathname, p))
  const isProtectedApi =
    pathname.startsWith("/api/") && !PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p))
  const needsAuth = isProtectedPage || isProtectedApi

  if (!hasSession && needsAuth) {
    // APIs answer 401 instead of redirecting: a fetch() follows redirects, so a
    // queued offline sale POSTed after sign-out would land on the login page's
    // 200 and be marked "synced" — lost. Pages still go to /login.
    if (isProtectedApi) {
      return NextResponse.json({ error: "Your sign-in has expired. Sign in again.", code: "unauthenticated" }, { status: 401 })
    }
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = "/login"
    return NextResponse.redirect(loginUrl)
  }
  // Signed-in users who hit /login go to their app home (not the landing).
  // ?expired=1: the session cookie is still there but no longer valid (ended,
  // or caught on an unapproved device) — let them sign in again.
  if (hasSession && pathname === "/login" && !request.nextUrl.searchParams.has("expired")) {
    const home = request.nextUrl.clone()
    home.pathname = "/home"
    return NextResponse.redirect(home)
  }
  return NextResponse.next()
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
