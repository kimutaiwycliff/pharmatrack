import { formatPhone } from "@/lib/phone"

export type SendResult = { status: "sent" | "skipped" | "failed"; error?: string }

const PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID
const TOKEN = process.env.WHATSAPP_TOKEN
const TEMPLATE = process.env.WHATSAPP_TEMPLATE
const LANG = process.env.WHATSAPP_LANG || "en"

export function whatsappConfigured(): boolean {
  return !!(PHONE_ID && TOKEN)
}

/**
 * Send a WhatsApp message via the Meta Cloud API. Degrades gracefully when
 * unconfigured. Business-initiated messages outside the 24h window require an
 * approved template — set WHATSAPP_TEMPLATE (a template whose body is a single
 * {{1}} parameter) for reliable delivery; otherwise a plain text message is
 * attempted (only valid inside an open conversation window).
 *
 * Env: WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_TOKEN, WHATSAPP_TEMPLATE (optional),
 *      WHATSAPP_LANG (optional, default "en").
 */
export async function sendWhatsApp(to: string, message: string): Promise<SendResult> {
  if (!PHONE_ID || !TOKEN) {
    console.warn("[whatsapp] not configured — skipping")
    return { status: "skipped", error: "WhatsApp not configured" }
  }

  const body = TEMPLATE
    ? {
        messaging_product: "whatsapp",
        to: formatPhone(to),
        type: "template",
        template: {
          name: TEMPLATE,
          language: { code: LANG },
          components: [{ type: "body", parameters: [{ type: "text", text: message }] }],
        },
      }
    : {
        messaging_product: "whatsapp",
        to: formatPhone(to),
        type: "text",
        text: { body: message },
      }

  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${PHONE_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text()
      return { status: "failed", error: `WhatsApp ${res.status}: ${text.slice(0, 200)}` }
    }
    return { status: "sent" }
  } catch (err) {
    return { status: "failed", error: err instanceof Error ? err.message : "WhatsApp send error" }
  }
}
