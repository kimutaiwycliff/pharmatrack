import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getTenantContext, requireActiveSubscription } from "@/lib/auth/helpers"
import { getMpesaConfig, mpesaStkAvailability } from "@/lib/mpesa/config"
import { formatPhone, stkCallbackUrl, stkPush } from "@/lib/mpesa/daraja"
import { withTenant, mpesa_stk_request } from "@pharmatrack/db"

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
      callbackUrl: stkCallbackUrl(),
    })
    const checkoutRequestId = typeof res.data.CheckoutRequestID === "string" ? res.data.CheckoutRequestID : null
    if (!res.ok || !checkoutRequestId) {
      const msg = (res.data.errorMessage ?? res.data.ResponseDescription ?? res.data.CustomerMessage) as string | undefined
      return NextResponse.json({ error: msg ?? "M-Pesa didn't accept the request" }, { status: 502 })
    }
    // Recorded so the payment can be confirmed and tied to one sale (migration 045).
    await withTenant(ctx, (db) => db.insert(mpesa_stk_request).values({
      organization_id: ctx.organizationId,
      checkout_request_id: checkoutRequestId,
      merchant_request_id: typeof res.data.MerchantRequestID === "string" ? res.data.MerchantRequestID : null,
      phone: formatPhone(parsed.data.phone),
      amount: String(Math.ceil(parsed.data.amount)),
      requested_by: ctx.userId,
    }))
    return NextResponse.json({ checkoutRequestId, message: res.data.CustomerMessage ?? "Prompt sent" })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "M-Pesa request failed" }, { status: 502 })
  }
}
