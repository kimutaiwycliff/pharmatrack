// Operator "Send an update" (ADR-019 follow-up): a one-off, personal email to
// pharmacy owners about the new setup guide. Pure — who belongs in which
// group, and what each group's email says. The route does the sending.

export type CampaignStage = "no_products" | "no_prices" | "no_stock" | "no_sale" | "selling"
export type CampaignGroup = "extend" | "nudge" | "selling"

export const CAMPAIGN_ID = "setup-guide-2026-10"
const DAY = 86_400_000
/** Pharmacies whose trial ended longer ago than this aren't emailed. */
export const LAPSED_WINDOW_DAYS = 60

export const GROUP_LABEL: Record<CampaignGroup, { title: string; description: string }> = {
  extend: { title: "Never got started", description: "No first sale yet — on trial, or trial ended in the last 60 days. Offered 14 more days." },
  nudge: { title: "Paying, not selling yet", description: "Subscribed but no first sale. Offered help to finish setup." },
  selling: { title: "Selling", description: "Already selling. Told about the guide's “Make it yours” steps." },
}

/** Which email (if any) a pharmacy gets. Test pharmacies and opt-outs get none. */
export function campaignGroup(t: {
  name: string; setupStage: CampaignStage; subscriptionStatus: string | null; renewsAt: number | null; optedOut?: boolean
}, now: number): CampaignGroup | null {
  if (t.optedOut || /\b(test|demo)\b/i.test(t.name)) return null
  const status = t.subscriptionStatus
  const selling = t.setupStage === "selling"
  if (selling) return status === "trialing" || status === "active" ? "selling" : null
  if (status === "trialing") return "extend"
  if (status === "active") return "nudge"
  // Trial (or plan) ended recently: still worth inviting back.
  if (t.renewsAt != null && now - t.renewsAt >= 0 && now - t.renewsAt <= LAPSED_WINDOW_DAYS * DAY) return "extend"
  return null
}

const STEPS_DONE: Record<CampaignStage, number> = { no_products: 1, no_prices: 2, no_stock: 3, no_sale: 4, selling: 5 }

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)

// PharmaTrack theme in email-safe HTML: tables + inline styles, no images
// (many inboxes block them), so the logo is the green tile with a white cross
// drawn in CSS, next to the "Pharma Track" wordmark as in the app header.
const FONT = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

function wrap(paragraphs: string[], cta: { href: string; label: string }, appUrl: string) {
  const p = paragraphs.map((x) => `<p style="margin:0 0 16px">${x}</p>`).join("")
  const logo = `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="34" height="34" align="center" valign="middle" style="width:34px;height:34px;background:#16a34a;border-radius:9px;color:#ffffff;font:700 24px/34px Arial,sans-serif">+</td>
<td style="padding-left:10px;${FONT};font-size:19px;font-weight:700;color:#111827;letter-spacing:-0.2px">Pharma <span style="color:#16a34a">Track</span></td>
</tr></table>`
  return `<div style="margin:0;padding:0;background:#f3f7f4">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f7f4"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">
<tr><td style="padding:0 4px 16px"><a href="${appUrl}" style="text-decoration:none">${logo}</a></td></tr>
<tr><td style="background:#ffffff;border:1px solid #e5e7eb;border-top:4px solid #16a34a;border-radius:14px;padding:28px 28px 24px;${FONT};font-size:15px;line-height:1.6;color:#111827">
${p}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px"><tr>
<td style="background:#16a34a;border-radius:10px"><a href="${cta.href}" style="display:inline-block;padding:12px 22px;${FONT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none">${esc(cta.label)} →</a></td>
</tr></table>
<p style="margin:0">Wycliff<br/><span style="color:#6b7280">PharmaTrack</span></p>
</td></tr>
<tr><td style="padding:16px 8px 0;${FONT};font-size:12px;line-height:1.5;color:#9ca3af;text-align:center">
Pharmacy software made in Kenya · <a href="${appUrl}" style="color:#15803d;text-decoration:none">pharmatrack.co.ke</a><br/>
Reply STOP and we won't email you about this again.
</td></tr>
</table></td></tr></table></div>`
}

export function campaignEmail(group: CampaignGroup, args: {
  appUrl: string; firstName: string; pharmacy: string; stage: CampaignStage; replyTo: string
}): { subject: string; html: string } {
  const name = esc(args.firstName || "there")
  const pharmacy = esc(args.pharmacy)
  const guide = { href: `${args.appUrl}/getting-started`, label: "Open my setup guide" }
  if (group === "extend") {
    return {
      subject: "Your till is still waiting for its first sale 👀",
      html: wrap([
        `Hi ${name},`,
        `${pharmacy} joined PharmaTrack a little while ago, but the till never got to ring up its first sale. No judgement — setting up new software is about as fun as a stock take. 😅`,
        "So we made it much easier. Sign in and a short setup guide walks you through it: pick your medicines from our catalogue of 3,800+ (no typing), set prices, add your stock and make your first sale. About 15 minutes, with tips at every step.",
        `And because life gets busy, <strong>we'd love to give you another 14 days free.</strong> Just reply “extend my trial” (or email <a href="mailto:${esc(args.replyTo)}" style="color:#15803d">${esc(args.replyTo)}</a>) and I'll switch it on.`,
        "Rather have a hand? Reply with a good time and I'll walk you through it on WhatsApp or a quick call.",
      ], guide, args.appUrl),
    }
  }
  if (group === "nudge") {
    const done = STEPS_DONE[args.stage]
    return {
      subject: "A 15-minute path to your first sale (plus a human if you want one)",
      html: wrap([
        `Hi ${name},`,
        "Quick one — PharmaTrack now has a setup guide that ticks itself off as you go: products → prices → stock → first sale, with tips right on the till.",
        `${pharmacy} is ${done} of 5 steps in, so the finish line is close! 🏁`,
        "If you'd like me to sit with you (virtually) while you make that first sale, just reply.",
      ], { href: guide.href, label: "Continue setup" }, args.appUrl),
    }
  }
  return {
    subject: "You're selling on PharmaTrack 🎉 — here's what's next",
    html: wrap([
      `Nice work, ${name}!`,
      `${pharmacy} is selling on PharmaTrack. We've just added a “Make it yours” list: invite your staff with their own till PINs, take M&#8209;Pesa at the till, put your logo on receipts and set your tills to sell offline. Each takes a few minutes.`,
      "Want a hand with any of them? Just reply — happy to help.",
    ], { href: guide.href, label: "See what's next" }, args.appUrl),
  }
}
