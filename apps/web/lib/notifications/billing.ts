import { and, eq } from "drizzle-orm"
import { dbAdmin, member, user } from "@pharmatrack/db"
import { sendEmail, type SendResult } from "./email"

// Subscription-ending reminder emails (7-day and 1-day). Mirrors platform.ts's
// shape: a recipient-resolution helper + a template function + a send
// wrapper. Billing contact = the organization's owner, resolved via `member`
// (role = "owner") -> `user.email` — there is no dedicated billing-contact
// field on `organization` or `subscription` (confirmed: none exists).

export async function ownerContact(organizationId: string): Promise<{ email: string; name: string } | null> {
  const [row] = await dbAdmin()
    .select({ email: user.email, name: user.name })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(and(eq(member.organizationId, organizationId), eq(member.role, "owner")))
    .limit(1)
  return row ?? null
}

export interface SubscriptionReminderContext {
  orgName: string
  ownerName: string
  milestone: "7_day" | "1_day"
  daysLeft: number
  expiresAt: Date
  isTrial: boolean
  billingUrl: string
}

function formatWhen(d: Date): string {
  return d.toLocaleDateString("en-KE", { timeZone: "Africa/Nairobi", day: "numeric", month: "long", year: "numeric" })
}

function esc(s: string): string {
  return s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] ?? c))
}

export function subscriptionReminderEmail(ctx: SubscriptionReminderContext): { subject: string; html: string } {
  const kind = ctx.isTrial ? "free trial" : "subscription"
  const urgent = ctx.milestone === "1_day"
  const when = formatWhen(ctx.expiresAt)
  const actionLabel = ctx.isTrial ? "Choose a plan" : "Renew now"
  const actionSentence = ctx.isTrial
    ? "choose a plan and add your payment details"
    : "renew your subscription"

  const subject = urgent
    ? `Action needed: your PharmaTrack ${kind} ends tomorrow`
    : `Your PharmaTrack ${kind} ends in ${ctx.daysLeft} days`

  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:480px;color:#111827">
      <h2 style="margin:0 0 12px">${urgent ? "Your access ends tomorrow" : `${ctx.daysLeft} days left on your ${esc(kind)}`}</h2>
      <p>Hi ${esc(ctx.ownerName)},</p>
      <p>
        This is a friendly reminder that <strong>${esc(ctx.orgName)}</strong>'s PharmaTrack ${esc(kind)}
        ${urgent ? "ends tomorrow" : `ends in ${ctx.daysLeft} days`}, on <strong>${when}</strong>.
      </p>
      <p>
        To keep uninterrupted access to your pharmacy's point of sale, inventory, and reports,
        please ${actionSentence} before then.
      </p>
      <p style="margin:24px 0">
        <a href="${ctx.billingUrl}" style="background:#15803d;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block">
          ${actionLabel}
        </a>
      </p>
      <p>If you have any questions or would like a hand, just reply to this email — we're happy to help.</p>
      <p style="color:#6b7280">Thank you for choosing PharmaTrack.</p>
    </div>`

  return { subject, html }
}

export async function sendSubscriptionReminder(to: string, ctx: SubscriptionReminderContext): Promise<SendResult> {
  const { subject, html } = subscriptionReminderEmail(ctx)
  return sendEmail(to, subject, html)
}
