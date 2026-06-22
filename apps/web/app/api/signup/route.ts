import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { eq } from "drizzle-orm"
import { dbAdmin, user } from "@pharmatrack/db"
import { provisionTenant } from "@/lib/provisioning"
import { auth } from "@/lib/auth/server"
import { rateLimit, clientIp } from "@/lib/rate-limit"
import { verifySignupOtp } from "@/lib/email-otp"
import { notifyPlatformNewSignup } from "@/lib/notifications/platform"

function tooMany(retryAfter: number) {
  return NextResponse.json(
    { error: "Too many signups from this network. Please try again later." },
    { status: 429, headers: { "retry-after": String(Math.max(1, retryAfter)) } },
  )
}

// Self-serve trial signup (step 2). The caller must first verify their email via
// /api/signup/send-otp; the code proves email ownership before a tenant is
// created. Creates the tenant + owner, marks the email verified, and signs the
// owner in so they land straight in their dashboard.

const schema = z.object({
  pharmacy_name: z.string().trim().min(2, "Enter your pharmacy name").max(120),
  owner_name: z.string().trim().min(2, "Enter your name").max(120),
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(8, "Use at least 8 characters"),
  otp: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code"),
})

export async function POST(request: NextRequest) {
  // Throttle the trial-creation vector: 5 per hour per IP, with a 20/day ceiling.
  const ip = clientIp(request)
  const [burst, daily] = await Promise.all([
    rateLimit(`signup:ip:${ip}`, 5, 3600),
    rateLimit(`signup:ip:day:${ip}`, 20, 86_400),
  ])
  if (!burst.ok) return tooMany(burst.retryAfter)
  if (!daily.ok) return tooMany(daily.retryAfter)

  const parsed = schema.safeParse(await request.json().catch(() => undefined))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid details" }, { status: 400 })
  }
  const d = parsed.data

  // Also cap repeated attempts for the same email (cheap abuse / typo loops).
  const perEmail = await rateLimit(`signup:email:${d.email.toLowerCase()}`, 5, 3600)
  if (!perEmail.ok) return tooMany(perEmail.retryAfter)

  // Verify email ownership before creating anything (consumes the code).
  if (!(await verifySignupOtp(d.email, d.otp))) {
    return NextResponse.json({ error: "That code is invalid or has expired. Request a new one." }, { status: 400 })
  }

  // Provision tenant + owner (autoSignIn off → no session yet).
  let ownerId: string
  try {
    const res = await provisionTenant({
      pharmacyName: d.pharmacy_name,
      ownerEmail: d.email,
      ownerName: d.owner_name,
      ownerPassword: d.password,
      trialDays: 14,
    })
    ownerId = res.ownerId
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not create your account"
    // Surface actionable cases (email taken, breached password) cleanly; avoid
    // matching DB errors like "relation ... does not exist".
    let friendly = "We couldn't create your account. Please try again."
    if (/already exists|duplicate|unique constraint|user_email/i.test(msg))
      friendly = "An account with that email already exists — try signing in instead."
    else if (/breach|compromis|pwned/i.test(msg))
      friendly = "This password has appeared in a known data breach. Please choose a different one."
    return NextResponse.json({ error: friendly }, { status: 400 })
  }

  // Email is OTP-verified — reflect that on the owner record.
  try {
    await dbAdmin().update(user).set({ emailVerified: true, updatedAt: new Date() }).where(eq(user.id, ownerId))
  } catch { /* non-fatal */ }

  // Tell the platform a new pharmacy signed up (best-effort).
  await notifyPlatformNewSignup({ pharmacy: d.pharmacy_name, ownerName: d.owner_name, email: d.email, via: "trial" })

  // Sign the owner in — nextCookies writes the session cookie onto this response.
  try {
    await auth.api.signInEmail({ body: { email: d.email, password: d.password } })
  } catch {
    // Account created but sign-in failed for some reason — let them use /login.
    return NextResponse.json({ ok: true, signedIn: false }, { status: 201 })
  }

  return NextResponse.json({ ok: true, signedIn: true }, { status: 201 })
}
