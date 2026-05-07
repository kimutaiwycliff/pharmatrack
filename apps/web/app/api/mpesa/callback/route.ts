import { NextRequest, NextResponse } from "next/server"

// Safaricom posts to this endpoint after STK push completes.
// In production: MPESA_CALLBACK_URL must point here (requires public HTTPS URL).
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      Body?: {
        stkCallback?: {
          CheckoutRequestID?: string
          ResultCode?: number
          ResultDesc?: string
        }
      }
    }

    const cb = body.Body?.stkCallback
    if (!cb) return NextResponse.json({ ok: false })

    const { CheckoutRequestID, ResultCode } = cb

    // ResultCode 0 = success, anything else = failure
    // In a production system: look up the pending sale by CheckoutRequestID,
    // mark it paid or failed, then notify the client via SSE or polling.
    console.log("[M-Pesa callback]", { CheckoutRequestID, ResultCode })

    return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" })
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 })
  }
}
