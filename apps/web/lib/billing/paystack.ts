import crypto from "node:crypto"

const SECRET = process.env.PAYSTACK_SECRET_KEY
const BASE = "https://api.paystack.co"

export function paystackConfigured(): boolean {
  return !!SECRET
}

interface InitArgs {
  email: string
  amountKes: number
  currency?: string
  metadata: Record<string, unknown>
  callbackUrl?: string
}

interface InitResult {
  authorizationUrl: string
  reference: string
}

/** Start a Paystack transaction; returns the hosted checkout URL. */
export async function initializeTransaction(args: InitArgs): Promise<InitResult> {
  if (!SECRET) throw new Error("Paystack is not configured")
  const res = await fetch(`${BASE}/transaction/initialize`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: args.email,
      amount: Math.round(args.amountKes * 100), // smallest unit
      currency: args.currency ?? "KES",
      metadata: args.metadata,
      callback_url: args.callbackUrl,
    }),
  })
  const json = (await res.json()) as {
    status: boolean
    message: string
    data?: { authorization_url: string; reference: string }
  }
  if (!res.ok || !json.status || !json.data) {
    throw new Error(json.message || "Failed to start payment")
  }
  return { authorizationUrl: json.data.authorization_url, reference: json.data.reference }
}

/** Verify a Paystack webhook signature (HMAC-SHA512 of the raw body). */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  if (!SECRET || !signature) return false
  const hash = crypto.createHmac("sha512", SECRET).update(rawBody).digest("hex")
  try {
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature))
  } catch {
    return false
  }
}

/** Add one billing interval to a date. */
export function addInterval(from: Date, interval: string): Date {
  const d = new Date(from)
  if (interval === "annual") d.setFullYear(d.getFullYear() + 1)
  else d.setMonth(d.getMonth() + 1)
  return d
}
