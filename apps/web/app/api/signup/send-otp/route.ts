import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createSignupOtp } from "@/lib/email-otp"
import { sendEmail } from "@/lib/notifications/email"
import { rateLimit, clientIp } from "@/lib/rate-limit"
import { verifyTurnstile } from "@/lib/turnstile"

// Step 1 of self-serve signup: email a verification code. Rate-limited per IP and
// per email to prevent code-spam. Always returns ok (never reveals whether an
// address exists) — the code only matters at the /api/signup step.

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

  const emailLimit = await rateLimit(`otp:email:${email.toLowerCase()}`, 4, 3600)
  if (!emailLimit.ok) return tooMany(emailLimit.retryAfter)

  const code = await createSignupOtp(email)
  await sendEmail(
    email,
    "Your PharmaTrack verification code",
    `<p>Welcome to PharmaTrack.</p>
     <p>Your verification code is:</p>
     <p style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</p>
     <p style="color:#6b7280">It expires in 10 minutes. If you didn't request this, you can ignore this email.</p>`,
  )

  return NextResponse.json({ ok: true })
}
