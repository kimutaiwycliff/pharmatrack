import { NextRequest, NextResponse } from "next/server"

/**
 * Legacy email-link landing. Better Auth sends invite/recovery links straight to
 * /auth/set-password?token=…, so this only forwards any stragglers (a token here
 * → set-password; otherwise back to login).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const token = searchParams.get("token")
  if (token) return NextResponse.redirect(`${origin}/auth/set-password?token=${encodeURIComponent(token)}`)
  return NextResponse.redirect(`${origin}/login`)
}
