import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { provisionTenant } from "@/lib/provisioning"
import { auth } from "@/lib/auth/server"

// Self-serve trial signup. Creates the tenant + owner, signs the owner in (so
// they land straight in their dashboard) and fires a verification email. Better
// Auth applies its own rate limiting to the underlying sign-up/sign-in calls.

const schema = z.object({
  pharmacy_name: z.string().trim().min(2, "Enter your pharmacy name").max(120),
  owner_name: z.string().trim().min(2, "Enter your name").max(120),
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(8, "Use at least 8 characters"),
})

export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json().catch(() => undefined))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid details" }, { status: 400 })
  }
  const d = parsed.data

  // Provision tenant + owner (autoSignIn off → no session yet).
  try {
    await provisionTenant({
      pharmacyName: d.pharmacy_name,
      ownerEmail: d.email,
      ownerName: d.owner_name,
      ownerPassword: d.password,
      trialDays: 14,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not create your account"
    // Surface the common "email taken" case cleanly (without matching DB errors
    // like "relation ... does not exist").
    const friendly = /already exists|duplicate|unique constraint|user_email/i.test(msg)
      ? "An account with that email already exists — try signing in instead."
      : "We couldn't create your account. Please try again."
    return NextResponse.json({ error: friendly }, { status: 400 })
  }

  // Sign the owner in — nextCookies writes the session cookie onto this response.
  try {
    await auth.api.signInEmail({ body: { email: d.email, password: d.password } })
  } catch {
    // Account exists but sign-in failed for some reason — let them use /login.
    return NextResponse.json({ ok: true, signedIn: false }, { status: 201 })
  }

  // Best-effort email verification (non-blocking for trial start).
  try {
    await auth.api.sendVerificationEmail({ body: { email: d.email } })
  } catch { /* ignore */ }

  return NextResponse.json({ ok: true, signedIn: true }, { status: 201 })
}
