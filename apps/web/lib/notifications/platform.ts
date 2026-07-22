import { inArray } from "drizzle-orm"
import { dbAdmin, platform_admin, user } from "@pharmatrack/db"
import { sendEmail } from "./email"

// Notify the platform operator(s) about new tenants and subscription intent.
// Recipients: PLATFORM_NOTIFY_EMAIL (comma-separated) if set, otherwise every
// platform_admin's email. Best-effort — never blocks the user's request.

async function platformEmails(): Promise<string[]> {
  const explicit = process.env.PLATFORM_NOTIFY_EMAIL?.trim()
  if (explicit) return explicit.split(",").map((s) => s.trim()).filter(Boolean)
  try {
    const admins = await dbAdmin().select({ uid: platform_admin.user_id }).from(platform_admin)
    if (!admins.length) return []
    const rows = await dbAdmin().select({ email: user.email }).from(user).where(inArray(user.id, admins.map((a) => a.uid)))
    return rows.map((r) => r.email).filter(Boolean)
  } catch {
    return []
  }
}

async function send(subject: string, html: string) {
  const to = await platformEmails()
  if (!to.length) return
  await Promise.allSettled(to.map((email) => sendEmail(email, subject, html)))
}

export async function notifyPlatformNewSignup(info: {
  pharmacy: string; ownerName: string; email: string; via: "trial" | "google"
}): Promise<void> {
  try {
    await send(
      `New PharmaTrack ${info.via === "google" ? "Google " : ""}signup — ${info.pharmacy}`,
      `<p>A new pharmacy just started a trial on PharmaTrack.</p>
       <ul>
         <li><strong>Pharmacy:</strong> ${esc(info.pharmacy)}</li>
         <li><strong>Owner:</strong> ${esc(info.ownerName)}</li>
         <li><strong>Email:</strong> ${esc(info.email)}</li>
         <li><strong>Via:</strong> ${info.via === "google" ? "Google sign-up" : "Self-serve trial"}</li>
       </ul>
       <p>Manage them in the operator console.</p>`,
    )
  } catch { /* best-effort */ }
}

export async function notifyPlatformSubscription(info: {
  pharmacy: string; plan: string; email: string
}): Promise<void> {
  try {
    await send(
      `Subscription started — ${info.pharmacy}`,
      `<p>A pharmacy is starting a paid subscription.</p>
       <ul>
         <li><strong>Pharmacy:</strong> ${esc(info.pharmacy)}</li>
         <li><strong>Plan:</strong> ${esc(info.plan)}</li>
         <li><strong>Billing email:</strong> ${esc(info.email)}</li>
       </ul>`,
    )
  } catch { /* best-effort */ }
}

export async function notifyPlatformPaymentClaim(info: {
  pharmacy: string; plan: string; amountKes: number; reference: string; email: string
}): Promise<void> {
  try {
    await send(
      `Payment claim — ${info.pharmacy} says they've paid`,
      `<p>A pharmacy owner says they've sent a manual M-Pesa payment and is awaiting confirmation.</p>
       <ul>
         <li><strong>Pharmacy:</strong> ${esc(info.pharmacy)}</li>
         <li><strong>Plan:</strong> ${esc(info.plan)}</li>
         <li><strong>Amount claimed:</strong> KES ${info.amountKes.toLocaleString()}</li>
         <li><strong>M-Pesa reference:</strong> ${esc(info.reference)}</li>
         <li><strong>Billing email:</strong> ${esc(info.email)}</li>
       </ul>
       <p>Check your M-Pesa messages for that reference, then confirm or reject it in the operator console.</p>`,
    )
  } catch { /* best-effort */ }
}

function esc(s: string): string {
  return s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] ?? c))
}
