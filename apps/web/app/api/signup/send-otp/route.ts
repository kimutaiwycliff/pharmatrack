import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createSignupOtp } from "@/lib/email-otp"
import { sendEmail } from "@/lib/notifications/email"
import { rateLimit, clientIp } from "@/lib/rate-limit"
import { verifyTurnstile } from "@/lib/turnstile"
import { DISPOSABLE_EMAIL_MESSAGE, isDisposableEmail } from "@/lib/trials/disposable-domains"
import { blockingTrials, findPriorTrial, userExistsWithEmail } from "@/lib/trials/eligibility"

// Step 1 of self-serve signup: email a verification code. Rate-limited per IP and
// per email to prevent code-spam, and Turnstile-gated.
//
// Friendly early answers (behind the captcha + rate limits):
//  * disposable inbox            → 400, ask for a permanent address
//  * login already exists        → 409 "sign in instead" (code: account_exists)
//  * a trial was already used    → still send the code (they may want to
//    continue without a trial, i.e. subscribe) but flag `priorTrial: true` so the
//    form can say so up front. The pharmacy name / dates are only revealed by
//    /api/signup AFTER the code proves the person owns the inbox.

const schema = z.object({ email: z.string().trim().email("Enter a valid email") })

function tooMany(retryAfter: number) {
  return NextResponse.json(
    { error: "Too many code requests. Please wait a moment and try again." },
    { status: 429, headers: { "retry-after": String(Math.max(1, retryAfter)) } },
  )
}

export async function POST(request: NextRequest) {
  const ip = clientIp(request)
  const ipLimit = await rateLimit(`otp:ip:${ip}`, 10, 3600)
  if (!ipLimit.ok) return tooMany(ipLimit.retryAfter)

  // Cloudflare Turnstile (no-op unless configured). Token comes in the same
  // header Better Auth's captcha plugin uses.
  if (!(await verifyTurnstile(request.headers.get("x-captcha-response"), ip))) {
    return NextResponse.json({ error: "Captcha verification failed. Please try again." }, { status: 400 })
  }

  const parsed = schema.safeParse(await request.json().catch(() => undefined))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid email" }, { status: 400 })
  }
  const email = parsed.data.email

  if (isDisposableEmail(email)) {
    return NextResponse.json({ error: DISPOSABLE_EMAIL_MESSAGE, code: "disposable_email" }, { status: 400 })
  }

  const emailLimit = await rateLimit(`otp:email:${email.toLowerCase()}`, 4, 3600)
  if (!emailLimit.ok) return tooMany(emailLimit.retryAfter)

  if (await userExistsWithEmail(email)) {
    return NextResponse.json(
      { error: "An account with this email already exists — sign in instead.", code: "account_exists" },
      { status: 409 },
    )
  }
  const priorTrial = blockingTrials(await findPriorTrial({ email })).length > 0

  const code = await createSignupOtp(email)
  await sendEmail(
    email,
    "Your PharmaTrack verification code",
    `<p>Welcome to PharmaTrack.</p>
     <p>Your verification code is:</p>
     <p style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</p>
     <p style="color:#6b7280">It expires in 10 minutes. If you didn't request this, you can ignore this email.</p>`,
  )

  return NextResponse.json({ ok: true, priorTrial })
}
