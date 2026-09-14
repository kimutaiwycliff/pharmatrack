import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getTenantContext, requireActiveSubscription } from "@/lib/auth/helpers"
import { getMpesaConfig, mpesaStkAvailability } from "@/lib/mpesa/config"
import { stkPush } from "@/lib/mpesa/daraja"

const stkSchema = z.object({
  phone: z.string().min(9),
  amount: z.number().positive(),
  accountReference: z.string().min(1),
})

// STK push using the CALLING TENANT's own Daraja credentials. Only fires when the
// plan includes STK (Growth+) and the tenant has an active, complete config —
// otherwise the POS falls back to manual confirm.
export async function POST(request: NextRequest) {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const subErr = await requireActiveSubscription(ctx.organizationId)
  if (subErr) return subErr

  const parsed = stkSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 })
  }

  const status = await mpesaStkAvailability(ctx.organizationId)
  if (!status.available) {
    return NextResponse.json({
      error: !status.planAllowed
        ? "STK push is a Growth-plan feature. Upgrade, or confirm the M-Pesa payment manually."
        : "M-Pesa isn't set up yet — add your till in Settings → Payments, or confirm manually.",
      code: "stk_unavailable",
    }, { status: 403 })
  }

  const cfg = (await getMpesaConfig(ctx.organizationId))!
  try {
    const res = await stkPush(cfg, {
      phone: parsed.data.phone,
      amount: parsed.data.amount,
      accountRef: parsed.data.accountReference,
      callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/mpesa/callback`,
    })
    return NextResponse.json(res.data, { status: res.ok ? 200 : 502 })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "M-Pesa request failed" }, { status: 502 })
  }
}
