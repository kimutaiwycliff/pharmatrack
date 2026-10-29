import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { eq } from "drizzle-orm"
import { dbAdmin, mpesa_stk_request } from "@pharmatrack/db"
import { parseStkCallback, stkOutcome } from "@/lib/mpesa/stk"
import { refreshStkRequest } from "@/lib/mpesa/refresh"

// Safaricom posts here after an STK push completes. M-Pesa does NOT sign its
// callbacks, so authenticity is established by:
//   (a) an OPTIONAL source-IP allowlist (MPESA_CALLBACK_ALLOWLIST), and
//   (b) correlating CheckoutRequestID with a request we recorded (migration
//       045) that's still pending, and
//   (c) for success, confirming with an STK Query before marking it paid —
//       never from this body alone.
const callbackSchema = z.object({
  Body: z.object({ stkCallback: z.object({ CheckoutRequestID: z.string().min(1).max(100) }).passthrough() }),
})

function clientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for") ?? ""
  return xff.split(",")[0]?.trim() || req.headers.get("cf-connecting-ip") || ""
}

export async function POST(request: NextRequest) {
  // Optional allowlist: set MPESA_CALLBACK_ALLOWLIST to Safaricom's callback IPs
  // (comma-separated exact IPs or dotted prefixes) to drop spoofed callbacks.
  const allow = (process.env.MPESA_CALLBACK_ALLOWLIST ?? "").split(",").map((s) => s.trim()).filter(Boolean)
  if (allow.length) {
    const ip = clientIp(request)
    if (!allow.some((a) => ip === a || ip.startsWith(a))) {
      console.warn("[M-Pesa callback] rejected source IP:", ip)
      return NextResponse.json({ ResultCode: 1, ResultDesc: "Rejected" }, { status: 403 })
    }
  }

  const body: unknown = await request.json().catch(() => null)
  const cb = callbackSchema.safeParse(body).success ? parseStkCallback(body) : null
  if (!cb) {
    return NextResponse.json({ ResultCode: 1, ResultDesc: "Invalid payload" }, { status: 400 })
  }

  // Only for a push we sent and are still waiting on.
  const db = dbAdmin()
  const [row] = await db.select().from(mpesa_stk_request).where(eq(mpesa_stk_request.checkout_request_id, cb.checkoutRequestId)).limit(1)
  if (!row || row.status !== "pending") return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" })

  const outcome = stkOutcome(cb.resultCode, cb.resultDesc)
  if (outcome.status === "paid") {
    // Keep the receipt number (STK Query doesn't return it) — but "paid" is
    // only set once an STK Query confirms it: this body isn't signed.
    const [withReceipt] = await db.update(mpesa_stk_request)
      .set({ mpesa_receipt: cb.receipt, updated_at: new Date() })
      .where(eq(mpesa_stk_request.id, row.id)).returning()
    await refreshStkRequest(withReceipt ?? row, { force: true })
  } else if (outcome.status !== "pending") {
    // A declined/cancelled result can only make a pending request fail — safe to take as is.
    await db.update(mpesa_stk_request)
      .set({ status: outcome.status, result_code: String(cb.resultCode), result_desc: cb.resultDesc, updated_at: new Date() })
      .where(eq(mpesa_stk_request.id, row.id))
  }

  // Always ACK 0 so Safaricom stops retrying.
  return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" })
}
