import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

// Safaricom posts here after an STK push completes. M-Pesa does NOT sign its
// callbacks, so authenticity is established by:
//   (a) an OPTIONAL source-IP allowlist (MPESA_CALLBACK_ALLOWLIST), and
//   (b) — once sale confirmation is wired — correlating CheckoutRequestID against
//       a PERSISTED pending request. Never mark a sale paid from this body alone.
const callbackSchema = z.object({
  Body: z.object({
    stkCallback: z.object({
      CheckoutRequestID: z.string().optional(),
      ResultCode: z.number().optional(),
      ResultDesc: z.string().optional(),
    }),
  }),
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

  const parsed = callbackSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ ResultCode: 1, ResultDesc: "Invalid payload" }, { status: 400 })
  }

  const { CheckoutRequestID, ResultCode } = parsed.data.Body.stkCallback
  // TODO(payments): when STK confirmation is wired, look up the pending sale by
  // CheckoutRequestID (persisted at initiate time), verify it's ours and still
  // pending, then mark it paid/failed. Do NOT trust ResultCode from this body alone.
  console.log("[M-Pesa callback]", { CheckoutRequestID, ResultCode })

  // Always ACK 0 so Safaricom stops retrying.
  return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" })
}
