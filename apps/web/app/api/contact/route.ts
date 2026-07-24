import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { sendEmail } from "@/lib/notifications/email"
import { platformContact } from "@/lib/platform-contact"
import { rateLimit, clientIp } from "@/lib/rate-limit"

// Public marketing-site contact widget — no auth, so it's rate-limited by IP
// and guarded by a honeypot field. Delivers straight to the operator's inbox
// (no WhatsApp Business API / Meta verification needed for a simple lead form).

const contactSchema = z.object({
  name: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().email().max(120).optional().or(z.literal("")),
  message: z.string().trim().min(1).max(2000),
  // Hidden field real visitors never fill; a non-empty value means a bot.
  website: z.string().max(0).optional(),
})

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)
}

export async function POST(request: NextRequest) {
  const ip = clientIp(request)
  const limit = await rateLimit(`contact:ip:${ip}`, 5, 600)
  if (!limit.ok) {
    return NextResponse.json({ error: "Too many messages — please try again shortly." }, { status: 429 })
  }

  const parsed = contactSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 })
  }
  const d = parsed.data
  if (d.website) return NextResponse.json({ ok: true }) // honeypot tripped — pretend success, drop silently

  const contact = platformContact()
  if (!contact.email) {
    return NextResponse.json({ error: "Messaging isn't set up yet — please use WhatsApp instead." }, { status: 503 })
  }

  const html = `
    <p><strong>New message from the PharmaTrack website</strong></p>
    <p><strong>Name:</strong> ${escapeHtml(d.name || "—")}<br/>
       <strong>Phone:</strong> ${escapeHtml(d.phone || "—")}<br/>
       <strong>Email:</strong> ${escapeHtml(d.email || "—")}</p>
    <p><strong>Message:</strong></p>
    <p>${escapeHtml(d.message).replace(/\n/g, "<br/>")}</p>
  `
  const result = await sendEmail(contact.email, `Website message from ${d.name || "a visitor"}`, html)
  if (result.status !== "sent") {
    return NextResponse.json({ error: "Couldn't deliver your message — please try WhatsApp instead." }, { status: 502 })
  }
  return NextResponse.json({ ok: true })
}
