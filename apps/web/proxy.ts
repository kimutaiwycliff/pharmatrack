import { NextResponse, type NextRequest } from "next/server"
import { getSessionCookie } from "better-auth/cookies"

// Next 16 middleware (exported as `proxy`). Edge-safe: it only does an OPTIMISTIC
// session-cookie check (no DB) to gate routes. Real session validation + the
// first-run /setup and role-based routing happen in server components (which can
// hit the DB). See ADR-002.
//
// Public routes need no session: auth pages, Better Auth's own endpoints, the
// first-run setup, health, and provider webhooks/callbacks (which self-authenticate).
const PUBLIC_ROUTES = [
  "/login", "/setup", "/auth",
  "/api/auth", "/api/health", "/api/webhooks", "/api/mpesa", "/api/cron", "/api/setup",
]

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isPublic = PUBLIC_ROUTES.some((r) => pathname.startsWith(r))
  const hasSession = !!getSessionCookie(request)

  if (!hasSession && !isPublic) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = "/login"
    return NextResponse.redirect(loginUrl)
  }
  if (hasSession && pathname === "/login") {
    const home = request.nextUrl.clone()
    home.pathname = "/"
    return NextResponse.redirect(home)
  }
  return NextResponse.next()
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
