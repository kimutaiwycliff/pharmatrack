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

/** A matching trial_grant row, as shown to the operator (see lib/trials/eligibility). */
export interface SignupSignal {
  org_name: string | null
  created_at: string
  source: string
  granted: boolean
  matched_on: string[]
}

const VIA_LABEL: Record<"trial" | "google" | "onboarding", string> = {
  trial: "Self-serve signup (email + code)",
  google: "Google sign-up",
  onboarding: "Onboarding (existing login, no pharmacy)",
}

const MATCH_LABEL: Record<string, string> = {
  email: "same email", google: "same Google account", registration_number: "same PPB registration no.", ip: "same network (IP)",
}

export async function notifyPlatformNewSignup(info: {
  pharmacy: string; ownerName: string; email: string; via: "trial" | "google" | "onboarding"
  /** false = a prior trial matched, so the account was created without one. */
  trialGranted: boolean
  trialDays?: number
  registrationNumber?: string | null
  /** Other trial_grant rows sharing this person's email / Google / reg. no. / IP. */
  signals?: SignupSignal[]
  extensionRequested?: boolean
}): Promise<void> {
  try {
    const signals = info.signals ?? []
    const hard = signals.some((s) => s.matched_on.some((m) => m !== "ip"))
    const signalHtml = signals.length
      ? `<p><strong>${hard ? "Previous trials found" : "Shared network with earlier signups (informational)"}:</strong></p>
         <ul>${signals.slice(0, 10).map((s) => `<li>${esc(s.org_name ?? "Deleted pharmacy")} — ${fmtDate(s.created_at)} · ${esc(s.source)}${s.granted ? "" : " (no trial)"} · ${esc(s.matched_on.map((m) => MATCH_LABEL[m] ?? m).join(", "))}</li>`).join("")}</ul>`
      : ""
    await send(
      `New PharmaTrack ${info.via === "google" ? "Google " : ""}signup — ${info.pharmacy}${info.trialGranted ? "" : " (no trial: repeat)"}`,
      `<p>${info.trialGranted
          ? `A new pharmacy just started a ${info.trialDays ?? ""}${info.trialDays ? "-day " : ""}trial on PharmaTrack.`
          : "A new pharmacy account was created <strong>without a free trial</strong> because a previous trial matched these details. They must subscribe (or you can approve a trial extension) before using the app."}</p>
       <ul>
         <li><strong>Pharmacy:</strong> ${esc(info.pharmacy)}</li>
         <li><strong>Owner:</strong> ${esc(info.ownerName)}</li>
         <li><strong>Email:</strong> ${esc(info.email)}</li>
         ${info.registrationNumber ? `<li><strong>PPB registration no.:</strong> ${esc(info.registrationNumber)}</li>` : ""}
         <li><strong>Via:</strong> ${VIA_LABEL[info.via]}</li>
         ${info.extensionRequested ? "<li><strong>Trial extension requested</strong> — review it in the operator console.</li>" : ""}
       </ul>
       ${signalHtml}
       <p>Manage them in the operator console.</p>`,
    )
  } catch { /* best-effort */ }
}

export async function notifyPlatformTrialExtensionRequest(info: {
  pharmacy: string; organizationId: string; email: string; message?: string | null
}): Promise<void> {
  try {
    const url = process.env.NEXT_PUBLIC_APP_URL ? `${process.env.NEXT_PUBLIC_APP_URL}/platform/${info.organizationId}` : null
    await send(
      `Trial extension request — ${info.pharmacy}`,
      `<p>A pharmacy owner is asking for a free trial (or more trial time).</p>
       <ul>
         <li><strong>Pharmacy:</strong> ${esc(info.pharmacy)}</li>
         <li><strong>Owner email:</strong> ${esc(info.email)}</li>
         ${info.message ? `<li><strong>Message:</strong> ${esc(info.message)}</li>` : ""}
       </ul>
       <p>Approve or decline it in the operator console${url ? `: <a href="${url}">${url}</a>` : ""}.</p>`,
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

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-KE", { timeZone: "Africa/Nairobi", day: "numeric", month: "short", year: "numeric" })
}

function esc(s: string): string {
  return s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c] ?? c))
}

/** Weekly operator digest (app/api/cron/platform-digest). Returns how many addresses it went to. */
export async function sendPlatformDigest(subject: string, html: string): Promise<number> {
  const to = await platformEmails()
  if (!to.length) return 0
  const results = await Promise.allSettled(to.map((email) => sendEmail(email, subject, html)))
  return results.filter((r) => r.status === "fulfilled" && r.value.status === "sent").length
}
