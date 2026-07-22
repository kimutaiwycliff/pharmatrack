import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getSession, getTenantContext } from "@/lib/auth/helpers"
import { provisionTenantForUser } from "@/lib/provisioning"
import { notifyPlatformNewSignup } from "@/lib/notifications/platform"
import { rateLimit, clientIp } from "@/lib/rate-limit"
import { trialDaysForSignup } from "@/lib/launch-offer"

// Completes signup for a user who authenticated (e.g. Google) but has no pharmacy
// yet: they name it, and we provision the tenant + trial against their existing
// account. The /home router sends such users here.

const schema = z.object({ pharmacy_name: z.string().trim().min(2, "Enter your pharmacy name").max(120) })

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Idempotent: if they already belong to a tenant, there's nothing to do.
  if (await getTenantContext()) return NextResponse.json({ ok: true, alreadyOnboarded: true })

  const rl = await rateLimit(`onboarding:user:${session.user.id}:${clientIp(request)}`, 5, 3600)
  if (!rl.ok) return NextResponse.json({ error: "Too many attempts. Please try again later." }, { status: 429 })

  const parsed = schema.safeParse(await request.json().catch(() => undefined))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 })

  try {
    await provisionTenantForUser({ userId: session.user.id, pharmacyName: parsed.data.pharmacy_name, trialDays: trialDaysForSignup() })
  } catch {
    return NextResponse.json({ error: "Could not create your pharmacy. Please try again." }, { status: 400 })
  }

  await notifyPlatformNewSignup({
    pharmacy: parsed.data.pharmacy_name,
    ownerName: session.user.name ?? session.user.email,
    email: session.user.email,
    via: "google",
  })

  return NextResponse.json({ ok: true })
}
