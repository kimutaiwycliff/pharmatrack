import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { ADDON_CODES, type AddonCode } from "@pharmatrack/core"
import { getApiContext } from "@/lib/api-auth"
import { getSession } from "@/lib/auth/helpers"
import { rateLimit } from "@/lib/rate-limit"
import { platformContact } from "@/lib/platform-contact"
import { requestAddon, tenantAddons } from "@/lib/cashier-station/addons"

// Settings → Add-ons (ADR-021). The owner sees each add-on offered on this
// deploy, its price and state, and asks for it (or its renewal). PharmaTrack
// switches it on once the payment has arrived.

const requestSchema = z.object({
  code: z.enum(ADDON_CODES as unknown as [AddonCode, ...AddonCode[]]),
  note: z.string().trim().max(500).optional(),
})

export async function GET() {
  const ctx = await getApiContext({ permission: ["billing.manage", "branches.manage", "settings.organization"] })
  if ("error" in ctx) return ctx.error
  return NextResponse.json({ addons: await tenantAddons(ctx.organizationId), paymentNumber: platformContact().paymentNumber })
}

export async function POST(request: NextRequest) {
  const ctx = await getApiContext({ permission: "billing.manage" })
  if ("error" in ctx) return ctx.error
  const rl = await rateLimit(`addon-req:org:${ctx.organizationId}`, 3, 86_400)
  if (!rl.ok) {
    return NextResponse.json({ error: "You've sent several requests today — we'll be in touch." }, { status: 429, headers: { "retry-after": String(Math.max(1, rl.retryAfter)) } })
  }
  const parsed = requestSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 })
  const email = (await getSession())?.user?.email
  if (!email) return NextResponse.json({ error: "No email on file" }, { status: 400 })
  const out = await requestAddon({ organizationId: ctx.organizationId, code: parsed.data.code, userId: ctx.userId, email, note: parsed.data.note || null })
  if ("error" in out) return NextResponse.json({ error: out.error }, { status: 409 })
  return NextResponse.json({ ok: true }, { status: 201 })
}
