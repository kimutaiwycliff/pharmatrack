import { toE164 } from "@/lib/phone"

export type SendResult = { status: "sent" | "skipped" | "failed"; error?: string }

/**
 * Send an SMS via Africa's Talking. Degrades gracefully: if credentials are not
 * configured it returns `skipped` (logged) so booking flows keep working before
 * the keys are added.
 *
 * Env: AT_USERNAME, AT_API_KEY, AT_SENDER_ID (optional sender/short code),
 *      AT_SANDBOX ("true" to use the sandbox endpoint).
 */
export async function sendSms(to: string, message: string): Promise<SendResult> {
  const username = process.env.AT_USERNAME
  const apiKey = process.env.AT_API_KEY
  const senderId = process.env.AT_SENDER_ID

  if (!username || !apiKey) {
    console.warn("[sms] Africa's Talking not configured — skipping SMS")
    return { status: "skipped", error: "SMS provider not configured" }
  }

  const base =
    process.env.AT_SANDBOX === "true"
      ? "https://api.sandbox.africastalking.com"
      : "https://api.africastalking.com"

  const body = new URLSearchParams({
    username,
    to: toE164(to),
    message,
  })
  if (senderId) body.set("from", senderId)

  try {
    const res = await fetch(`${base}/version1/messaging`, {
      method: "POST",
      headers: {
        apiKey,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body,
    })
    if (!res.ok) {
      const text = await res.text()
      return { status: "failed", error: `AT ${res.status}: ${text.slice(0, 200)}` }
    }
    return { status: "sent" }
  } catch (err) {
    return { status: "failed", error: err instanceof Error ? err.message : "SMS send error" }
  }
}
