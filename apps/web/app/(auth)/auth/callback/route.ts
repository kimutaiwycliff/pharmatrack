import { NextRequest, NextResponse } from "next/server"
import type { EmailOtpType } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/server"

/**
 * Lands users coming from Supabase email links (invite / recovery / signup /
 * email change). Establishes a session from either a PKCE `code` or a
 * `token_hash` + `type`, then routes invite/recovery users to set a password.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const tokenHash = searchParams.get("token_hash")
  const type = searchParams.get("type") as EmailOtpType | null

  const supabase = await createClient()

  let ok = false
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    ok = !error
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    ok = !error
  }

  if (!ok) {
    return NextResponse.redirect(`${origin}/login?error=invalid_or_expired_link`)
  }

  const needsPassword = type === "invite" || type === "recovery"
  return NextResponse.redirect(`${origin}${needsPassword ? "/auth/set-password" : "/"}`)
}
