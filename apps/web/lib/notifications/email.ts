export type SendResult = { status: "sent" | "skipped" | "failed"; error?: string }

/**
 * Send an email via Resend. Degrades gracefully: if not configured it returns
 * `skipped` (logged).
 *
 * Env: RESEND_API_KEY, RESEND_FROM (e.g. "PharmaTrack <noreply@yourdomain.com>").
 */
export async function sendEmail(to: string, subject: string, html: string): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM

  if (!apiKey || !from) {
    console.warn("[email] Resend not configured — skipping email")
    return { status: "skipped", error: "Email provider not configured" }
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, html }),
    })
    if (!res.ok) {
      const text = await res.text()
      return { status: "failed", error: `Resend ${res.status}: ${text.slice(0, 200)}` }
    }
    return { status: "sent" }
  } catch (err) {
    return { status: "failed", error: err instanceof Error ? err.message : "Email send error" }
  }
}
