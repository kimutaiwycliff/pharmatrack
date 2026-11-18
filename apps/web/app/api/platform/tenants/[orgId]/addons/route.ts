import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { ADDON_CODES, ADDON_LABELS, type AddonCode } from "@pharmatrack/core"
import { getPlatformContext } from "@/lib/platform"
import { confirmAddonPayment, revokeAddon, tenantAddons } from "@/lib/cashier-station/addons"
import { ownerContact } from "@/lib/notifications/billing"
import { sendEmail } from "@/lib/notifications/email"

// Operator: a tenant's paid add-ons (ADR-021). Confirming a payment switches
// the add-on on (or extends it) until the covered day; revoking switches it
// off now. Both are audit-logged; the owner is emailed when it goes on.

const code = z.enum(ADDON_CODES as unknown as [AddonCode, ...AddonCode[]])
const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("confirm"), code,
    months: z.number().int().min(1).max(12),
    amount_kes: z.number().min(0).max(1_000_000),
    method: z.enum(["mpesa", "bank", "cash", "card", "waived"]).default("mpesa"),
    reference: z.string().trim().max(60).optional(),
  }),
  z.object({ action: z.literal("revoke"), code }),
])

export async function GET(_request: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params
  if (!(await getPlatformContext())) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  return NextResponse.json({ addons: await tenantAddons(orgId) })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params
  const ctx = await getPlatformContext()
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const parsed = schema.safeParse(await request.json().catch(() => undefined))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 })
  const body = parsed.data

  if (body.action === "revoke") {
    const ok = await revokeAddon(ctx.db, { organizationId: orgId, code: body.code, actorId: ctx.user.id })
    if (!ok) return NextResponse.json({ error: "This pharmacy doesn't have that add-on" }, { status: 404 })
    return NextResponse.json({ addons: await tenantAddons(orgId) })
  }

  const out = await confirmAddonPayment(ctx.db, {
    organizationId: orgId, code: body.code, months: body.months, amountKes: body.amount_kes,
    method: body.method, reference: body.reference || null, actorId: ctx.user.id,
  })
  // Tell the owner (best-effort — the payment is recorded either way).
  const owner = await ownerContact(orgId).catch(() => null)
  if (owner) {
    const until = new Date(`${out.paidUntil}T12:00:00+03:00`).toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" })
    const name = ADDON_LABELS[body.code]
    await sendEmail(owner.email,
      out.firstActivation ? `${name} is on for your pharmacy` : `${name} renewed until ${until}`,
      `<p>Hi ${owner.name},</p>
       <p>We've received your payment${body.reference ? ` (${body.reference})` : ""}. The <strong>${name}</strong> add-on is active until <strong>${until}</strong>.</p>
       ${out.firstActivation ? "<p>Switch it on for each branch that pays at a cashier in <strong>Settings → Add-ons</strong>.</p>" : ""}
       <p>— PharmaTrack</p>`,
    ).catch(() => undefined)
  }
  return NextResponse.json({ paid_until: out.paidUntil, addons: await tenantAddons(orgId) })
}
