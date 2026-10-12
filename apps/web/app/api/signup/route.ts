import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { eq } from "drizzle-orm"
import { dbAdmin, user } from "@pharmatrack/db"
import { AccountExistsError, provisionTenant } from "@/lib/provisioning"
import { auth } from "@/lib/auth/server"
import { rateLimit, clientIp } from "@/lib/rate-limit"
import { peekSignupOtp, verifySignupOtp } from "@/lib/email-otp"
import { notifyPlatformNewSignup } from "@/lib/notifications/platform"
import { trialDaysForSignup } from "@/lib/launch-offer"
import { DISPOSABLE_EMAIL_MESSAGE, isDisposableEmail } from "@/lib/trials/disposable-domains"
import { blockingTrials, findPriorTrial, priorTrialSummary, requestSignals, userExistsWithEmail } from "@/lib/trials/eligibility"
import { createTrialExtensionRequest, MAX_EXTENSION_MESSAGE } from "@/lib/trials/extension"

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
//
// One free trial per person (lib/trials/eligibility.ts): if a previous trial
// matches the canonical email or PPB registration number, the first call
// returns 409 { code: "prior_trial", priorTrial } WITHOUT consuming the code so
// the form can explain and offer: sign in, subscribe (continue without a
// trial), or request a trial extension. The follow-up call carries `intent` and
// creates the account gated (past_due) until they pay or the operator approves.

const ACCOUNT_EXISTS = "An account with this email already exists — sign in instead."

const schema = z.object({
  pharmacy_name: z.string().trim().min(2, "Enter your pharmacy name").max(120),
  owner_name: z.string().trim().min(2, "Enter your name").max(120),
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(8, "Use at least 8 characters"),
  otp: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code"),
  registration_number: z.string().trim().max(60, "That registration number looks too long").optional(),
  intent: z.enum(["subscribe", "request_extension"]).optional(),
  extension_message: z.string().trim().max(MAX_EXTENSION_MESSAGE).optional(),
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
  const registrationNumber = d.registration_number || null

  if (isDisposableEmail(d.email)) {
    return NextResponse.json({ error: DISPOSABLE_EMAIL_MESSAGE, code: "disposable_email" }, { status: 400 })
  }

  // Also cap repeated attempts for the same email (cheap abuse / typo loops).
  const perEmail = await rateLimit(`signup:email:${d.email.toLowerCase()}`, 5, 3600)
  if (!perEmail.ok) return tooMany(perEmail.retryAfter)

  // Check the code first (without consuming it — we may need to ask a question).
  if (!(await peekSignupOtp(d.email, d.otp))) {
    return NextResponse.json({ error: "That code is invalid or has expired. Request a new one." }, { status: 400 })
  }

  // Duplicate login: Better Auth would answer with a fake user, so say it plainly.
  if (await userExistsWithEmail(d.email)) {
    return NextResponse.json({ error: ACCOUNT_EXISTS, code: "account_exists" }, { status: 409 })
  }

  const signals = requestSignals(request)
  const prior = await findPriorTrial({ email: d.email, registrationNumber, ip: signals.ip }, { includeIp: true })
  const trialDenied = blockingTrials(prior).length > 0
  if (trialDenied && !d.intent) {
    return NextResponse.json({
      error: "Looks like you've already tried PharmaTrack with these details.",
      code: "prior_trial",
      priorTrial: priorTrialSummary(prior),
    }, { status: 409 })
  }

  // Now consume the code (a parallel request may have used it in between).
  if (!(await verifySignupOtp(d.email, d.otp))) {
    return NextResponse.json({ error: "That code is invalid or has expired. Request a new one." }, { status: 400 })
  }

  // Provision tenant + owner (autoSignIn off → no session yet).
  const trialDays = trialDaysForSignup()
  let ownerId: string
  let organizationId: string
  try {
    const res = await provisionTenant({
      pharmacyName: d.pharmacy_name,
      ownerEmail: d.email,
      ownerName: d.owner_name,
      ownerPassword: d.password,
      trialDays,
      trialDenied,
      registrationNumber,
      grant: { source: "signup", ip: signals.ip, userAgent: signals.userAgent },
    })
    ownerId = res.ownerId
    organizationId = res.organizationId
  } catch (e) {
    if (e instanceof AccountExistsError) {
      return NextResponse.json({ error: ACCOUNT_EXISTS, code: "account_exists" }, { status: 409 })
    }
    const msg = e instanceof Error ? e.message : ""
    // Surface actionable cases cleanly; avoid matching DB errors like
    // "relation ... does not exist".
    let friendly = "We couldn't create your account. Please try again."
    if (/already exists|user_email/i.test(msg)) friendly = ACCOUNT_EXISTS
    else if (/breach|compromis|pwned/i.test(msg))
      friendly = "This password has appeared in a known data breach. Please choose a different one."
    else console.error("[signup] provisioning failed", e)
    return NextResponse.json({ error: friendly }, { status: 400 })
  }

  // Email is OTP-verified — reflect that on the owner record.
  try {
    await dbAdmin().update(user).set({ emailVerified: true, updatedAt: new Date() }).where(eq(user.id, ownerId))
  } catch { /* non-fatal */ }

  let extensionRequested = false
  if (trialDenied && d.intent === "request_extension") {
    try {
      const r = await createTrialExtensionRequest({ organizationId, userId: ownerId, email: d.email, message: d.extension_message })
      extensionRequested = "request" in r
    } catch (e) {
      console.error("[signup] could not record trial extension request", e)
    }
  }

  // Tell the platform a new pharmacy signed up (best-effort), with any
  // duplicate-identity signals (incl. shared IP, which never blocks).
  await notifyPlatformNewSignup({
    pharmacy: d.pharmacy_name, ownerName: d.owner_name, email: d.email, via: "trial",
    trialGranted: !trialDenied, trialDays, registrationNumber,
    signals: prior, extensionRequested,
  })

  // Sign the owner in — nextCookies writes the session cookie onto this response.
  try {
    await auth.api.signInEmail({ body: { email: d.email, password: d.password } })
  } catch {
    // Account created but sign-in failed for some reason — let them use /login.
    return NextResponse.json({ ok: true, signedIn: false, trial: !trialDenied, extensionRequested }, { status: 201 })
  }

  return NextResponse.json({ ok: true, signedIn: true, trial: !trialDenied, extensionRequested }, { status: 201 })
}
