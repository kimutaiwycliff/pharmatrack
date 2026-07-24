import { NextResponse, type NextRequest } from "next/server"
import { getSessionCookie } from "better-auth/cookies"

// Next 16 middleware (exported as `proxy`). Edge-safe: it only does an OPTIMISTIC
// session-cookie check (no DB) to gate routes. Real session validation + the
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
  "/reports", "/settings", "/shifts", "/staff", "/suppliers",
]

// API routes that self-authenticate (Better Auth, webhooks/callbacks, cron, health,
// first-run). Everything else under /api is treated as protected.
const PUBLIC_API_PREFIXES = [
  "/api/auth", "/api/health", "/api/webhooks", "/api/mpesa", "/api/cron", "/api/setup", "/api/signup", "/api/contact",
]

const underPrefix = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(prefix + "/")

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const hasSession = !!getSessionCookie(request)

  const isProtectedPage = PROTECTED_PAGE_PREFIXES.some((p) => underPrefix(pathname, p))
  const isProtectedApi =
    pathname.startsWith("/api/") && !PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p))
  const needsAuth = isProtectedPage || isProtectedApi

  if (!hasSession && needsAuth) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = "/login"
    return NextResponse.redirect(loginUrl)
  }
  // Signed-in users who hit /login go to their app home (not the landing).
  if (hasSession && pathname === "/login") {
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
