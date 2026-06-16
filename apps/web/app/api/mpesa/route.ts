import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getSession } from "@/lib/auth/helpers"

const stkSchema = z.object({
  phone: z.string().min(9),
  amount: z.number().positive(),
  accountReference: z.string().min(1),
})

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "")
  if (digits.startsWith("0") && digits.length === 10) return "254" + digits.slice(1)
  if (digits.startsWith("254")) return digits
  if (digits.length === 9) return "254" + digits
  return digits
}

async function getDarajaToken(): Promise<string> {
  const key = process.env.MPESA_CONSUMER_KEY
  const secret = process.env.MPESA_CONSUMER_SECRET

  if (!key || !secret || key === "xxx") throw new Error("M-Pesa credentials not configured")

  const creds = Buffer.from(`${key}:${secret}`).toString("base64")
  const base = process.env.MPESA_SANDBOX === "false"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke"

  const res = await fetch(`${base}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${creds}` },
  })
  if (!res.ok) throw new Error("Failed to get Daraja token")
  const json = (await res.json()) as { access_token: string }
  return json.access_token
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = (await request.json()) as unknown
  const parsed = stkSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    )
  }

  const shortcode = process.env.MPESA_SHORTCODE
  const passkey = process.env.MPESA_PASSKEY
  const callbackUrl = process.env.MPESA_CALLBACK_URL

  if (!shortcode || shortcode === "xxx" || !passkey || !callbackUrl) {
    // Dev fallback: return a mock checkout request ID so the UI can proceed to manual confirm
    return NextResponse.json(
      {
        CheckoutRequestID: "mock-" + Date.now(),
        ResponseCode: "0",
        CustomerMessage: "STK push simulated (no real credentials configured)",
        simulated: true,
      },
      { status: 200 },
    )
  }

  try {
    const token = await getDarajaToken()
    const timestamp = new Date()
      .toISOString()
      .replace(/[-T:Z.]/g, "")
      .slice(0, 14)
    const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString("base64")
    const base = process.env.MPESA_SANDBOX === "false"
      ? "https://api.safaricom.co.ke"
      : "https://sandbox.safaricom.co.ke"

    const phone = formatPhone(parsed.data.phone)

    const res = await fetch(`${base}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerBuyGoodsOnline",
        Amount: Math.ceil(parsed.data.amount),
        PartyA: phone,
        PartyB: shortcode,
        PhoneNumber: phone,
        CallBackURL: callbackUrl,
        AccountReference: parsed.data.accountReference,
        TransactionDesc: "PharmaTrack Sale",
      }),
    })

    const data = (await res.json()) as Record<string, unknown>
    return NextResponse.json(data, { status: res.ok ? 200 : 502 })
  } catch (err) {
    const message = err instanceof Error ? err.message : "M-Pesa request failed"
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
