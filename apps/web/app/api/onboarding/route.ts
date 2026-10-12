import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getSession, getTenantContext } from "@/lib/auth/helpers"
import { provisionTenantForUser } from "@/lib/provisioning"
import { notifyPlatformNewSignup } from "@/lib/notifications/platform"
import { rateLimit, clientIp } from "@/lib/rate-limit"
import { trialDaysForSignup } from "@/lib/launch-offer"
import { blockingTrials, findPriorTrial, googleAccountIdFor, priorTrialSummary, requestSignals } from "@/lib/trials/eligibility"
import { createTrialExtensionRequest, MAX_EXTENSION_MESSAGE } from "@/lib/trials/extension"

// Completes signup for a user who authenticated (e.g. Google) but has no pharmacy
// yet: they name it, and we provision the tenant + trial against their existing
// account. The /home router sends such users here.
//
// Requires a VERIFIED email (Google accounts are; the public email sign-up
// endpoint is closed — see lib/auth/server.ts). Applies the same one-trial-per-
// person check as /api/signup, additionally matching the Google account id:
// a prior trial → 409 { code: "prior_trial" } until the caller picks an
// `intent` (subscribe / request_extension), then the tenant is created gated.

const schema = z.object({
  pharmacy_name: z.string().trim().min(2, "Enter your pharmacy name").max(120),
  registration_number: z.string().trim().max(60, "That registration number looks too long").optional(),
  intent: z.enum(["subscribe", "request_extension"]).optional(),
  extension_message: z.string().trim().max(MAX_EXTENSION_MESSAGE).optional(),
})

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Idempotent: if they already belong to a tenant, there's nothing to do.
  if (await getTenantContext()) return NextResponse.json({ ok: true, alreadyOnboarded: true })

  if (!session.user.emailVerified) {
    return NextResponse.json(
      { error: "Please verify your email address before creating a pharmacy.", code: "email_unverified" },
      { status: 403 },
    )
  }

  const rl = await rateLimit(`onboarding:user:${session.user.id}:${clientIp(request)}`, 5, 3600)
  if (!rl.ok) return NextResponse.json({ error: "Too many attempts. Please try again later." }, { status: 429 })

  const parsed = schema.safeParse(await request.json().catch(() => undefined))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 })
  const d = parsed.data
  const registrationNumber = d.registration_number || null

  const googleAccountId = await googleAccountIdFor(session.user.id)
  const via = googleAccountId ? "google" as const : "onboarding" as const
  const signals = requestSignals(request)
  const prior = await findPriorTrial(
    { email: session.user.email, googleAccountId, registrationNumber, ip: signals.ip },
    { includeIp: true },
  )
  const trialDenied = blockingTrials(prior).length > 0
  if (trialDenied && !d.intent) {
    return NextResponse.json({
      error: "Looks like you've already tried PharmaTrack with these details.",
      code: "prior_trial",
      priorTrial: priorTrialSummary(prior),
    }, { status: 409 })
  }

  const trialDays = trialDaysForSignup()
  let organizationId: string
  try {
    const res = await provisionTenantForUser({
      userId: session.user.id,
      email: session.user.email,
      pharmacyName: d.pharmacy_name,
      trialDays,
      trialDenied,
      registrationNumber,
      grant: { source: googleAccountId ? "google" : "signup", googleAccountId, ip: signals.ip, userAgent: signals.userAgent },
    })
    organizationId = res.organizationId
  } catch (e) {
    console.error("[onboarding] provisioning failed", e)
    return NextResponse.json({ error: "Could not create your pharmacy. Please try again." }, { status: 400 })
  }

  let extensionRequested = false
  if (trialDenied && d.intent === "request_extension") {
    try {
      const r = await createTrialExtensionRequest({ organizationId, userId: session.user.id, email: session.user.email, message: d.extension_message })
      extensionRequested = "request" in r
    } catch (e) {
      console.error("[onboarding] could not record trial extension request", e)
    }
  }

  await notifyPlatformNewSignup({
    pharmacy: d.pharmacy_name,
    ownerName: session.user.name ?? session.user.email,
    email: session.user.email,
    via,
    trialGranted: !trialDenied,
    trialDays,
    registrationNumber,
    signals: prior,
    extensionRequested,
  })

  return NextResponse.json({ ok: true, trial: !trialDenied, extensionRequested })
}
