// Activation emails (ADR-019) — a short series that helps a new trial
// pharmacy reach its first sale, each linking straight to the step it's stuck
// on. Pure (unit-tested); the cron route does the sending. OFF until the
// owner-approved wording is switched on with ACTIVATION_EMAILS_ENABLED=1.

export type ActivationStage = "no_products" | "no_prices" | "no_stock" | "no_sale" | "selling"
export type ActivationKind = "welcome" | "no_products" | "no_sale" | "halfway"

export const ACTIVATION_KINDS: readonly ActivationKind[] = ["welcome", "no_products", "no_sale", "halfway"]

/** Only pharmacies this young get the series (older tenants are never emailed). */
export const ACTIVATION_MAX_AGE_HOURS = 14 * 24

/** The one email (if any) due now. At most one per run, earliest first, never repeated. */
export function activationEmailDue(args: {
  ageHours: number; stage: ActivationStage; trialing: boolean; sent: ReadonlySet<ActivationKind>
}): ActivationKind | null {
  const { ageHours: h, stage, trialing, sent } = args
  if (!trialing || h > ACTIVATION_MAX_AGE_HOURS) return null
  const notSelling = stage !== "selling"
  if (!sent.has("welcome") && h >= 0.5 && h < 48) return "welcome"
  if (!sent.has("no_products") && h >= 24 && h < 72 && (stage === "no_products" || stage === "no_prices")) return "no_products"
  if (!sent.has("no_sale") && h >= 72 && h < 7 * 24 && notSelling) return "no_sale"
  if (!sent.has("halfway") && h >= 7 * 24) return "halfway"
  return null
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)

const NEXT_STEP: Record<Exclude<ActivationStage, "selling">, { label: string; path: string; line: string }> = {
  no_products: { label: "Add your products", path: "/products?quickstart=1", line: "Tick the medicines you stock from our catalogue of 3,800+ — it takes about 4 minutes and there's no typing." },
  no_prices: { label: "Set your prices", path: "/products?needsPrice=1", line: "Your products are in — they just need selling prices before the till can sell them." },
  no_stock: { label: "Add your stock", path: "/inventory/receive?tour=1", line: "Count what's on the shelf with each batch's expiry date, so the till sells the earliest expiry first." },
  no_sale: { label: "Make your first sale", path: "/pos?coach=1", line: "Everything's ready. Open the till, start a shift and sell your first product — we'll show you each step." },
}

function button(href: string, label: string) {
  return `<p style="margin:24px 0"><a href="${href}" style="background:#16a34a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;display:inline-block">${esc(label)}</a></p>`
}

function layout(body: string) {
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.55;color:#111827;max-width:560px">${body}
<p style="color:#6b7280;font-size:13px;margin-top:28px">Stuck? Reply to this email or WhatsApp us — we'll help you set up.<br/>— The PharmaTrack team</p></div>`
}

export function activationEmail(kind: ActivationKind, args: {
  appUrl: string; firstName: string; pharmacy: string; stage: ActivationStage; trialDaysLeft: number; coreDone: number; coreTotal: number
}): { subject: string; html: string } {
  const hi = `<p>Hi ${esc(args.firstName || "there")},</p>`
  const next = args.stage === "selling" ? null : NEXT_STEP[args.stage]
  const guide = `${args.appUrl}/getting-started`

  if (kind === "welcome") {
    return {
      subject: `Welcome to PharmaTrack — let's get ${args.pharmacy} selling`,
      html: layout(`${hi}<p>Your free trial for <strong>${esc(args.pharmacy)}</strong> is ready. Most pharmacies are selling within 15 minutes:</p>
<ol><li>Add your products (pick them from our catalogue)</li><li>Set your prices</li><li>Add your stock with expiry dates</li><li>Make your first sale</li></ol>
${button(guide, "Open your setup guide")}`),
    }
  }
  if (kind === "no_products" && next) {
    return {
      subject: `${args.pharmacy}: your next step takes about 4 minutes`,
      html: layout(`${hi}<p>${esc(next.line)}</p>${button(`${args.appUrl}${next.path}`, next.label)}`),
    }
  }
  if (kind === "no_sale" && next) {
    return {
      subject: `You're ${args.coreDone} of ${args.coreTotal} steps from selling on PharmaTrack`,
      html: layout(`${hi}<p>You've made a start on <strong>${esc(args.pharmacy)}</strong> — ${args.coreDone} of ${args.coreTotal} setup steps done. Next:</p>
<p><strong>${esc(next.label)}.</strong> ${esc(next.line)}</p>${button(`${args.appUrl}${next.path}`, next.label)}`),
    }
  }
  // halfway
  const status = args.stage === "selling"
    ? "<p>You're selling on PharmaTrack — great. This week, try inviting your staff (each gets their own till PIN) and setting up M-Pesa at the till.</p>"
    : `<p>You're ${args.coreDone} of ${args.coreTotal} setup steps in. ${next ? `Next up: <strong>${esc(next.label)}</strong>.` : ""}</p>`
  return {
    subject: `${args.trialDaysLeft} day${args.trialDaysLeft === 1 ? "" : "s"} left in your PharmaTrack trial`,
    html: layout(`${hi}${status}${button(args.stage === "selling" ? guide : `${args.appUrl}${next?.path ?? "/getting-started"}`, args.stage === "selling" ? "See what's next" : next?.label ?? "Open your setup guide")}`),
  }
}
