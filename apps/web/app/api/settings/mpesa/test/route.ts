import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { eq } from "drizzle-orm"
import { dbAdmin, mpesa_config } from "@pharmatrack/db"
import { getTenantContext } from "@/lib/auth/helpers"
import { getMpesaConfig, isConfigured } from "@/lib/mpesa/config"
import { getDarajaToken, stkPush } from "@/lib/mpesa/daraja"

const schema = z.object({ stkPhone: z.string().trim().optional() })

// Validate the saved credentials: OAuth token (connection), and optionally a live
// KES 1 STK push to the owner's phone (end-to-end). Marks the config verified.
export async function POST(request: NextRequest) {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (ctx.role !== "owner") return NextResponse.json({ error: "Owner only" }, { status: 403 })

  const parsed = schema.safeParse(await request.json().catch(() => ({})))
  const stkPhone = parsed.success ? parsed.data.stkPhone : undefined

  const cfg = await getMpesaConfig(ctx.organizationId)
  if (!cfg || !isConfigured(cfg)) {
    return NextResponse.json({ ok: false, error: "Save your shortcode, consumer key/secret and passkey first." }, { status: 400 })
  }

  try {
    await getDarajaToken(cfg) // throws on bad key/secret
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Connection failed" }, { status: 200 })
  }

  let stk: { requested: true; accepted: boolean; message: string } | undefined
  if (stkPhone) {
    try {
      const res = await stkPush(cfg, {
        phone: stkPhone, amount: 1, accountRef: "TEST",
        callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/mpesa/callback`,
      })
      const accepted = res.ok && String(res.data.ResponseCode ?? "") === "0"
      stk = { requested: true, accepted, message: accepted
        ? "STK sent — approve the KES 1 prompt on your phone."
        : String(res.data.errorMessage ?? res.data.ResponseDescription ?? "STK push was rejected by Daraja") }
      if (!accepted) return NextResponse.json({ ok: false, tokenOk: true, stk }, { status: 200 })
    } catch (e) {
      return NextResponse.json({ ok: false, tokenOk: true, error: e instanceof Error ? e.message : "STK failed" }, { status: 200 })
    }
  }

  await dbAdmin().update(mpesa_config).set({ verified_at: new Date(), updated_at: new Date() })
    .where(eq(mpesa_config.organization_id, ctx.organizationId))

  return NextResponse.json({ ok: true, tokenOk: true, stk })
}
