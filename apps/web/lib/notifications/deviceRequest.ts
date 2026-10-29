import { eq } from "drizzle-orm"
import { dbAdmin, organization, staff_profile, user } from "@pharmatrack/db"
import { formatPairingCode } from "@pharmatrack/core"
import { ownerContact } from "@/lib/notifications/billing"
import { sendEmail } from "@/lib/notifications/email"
import { redis } from "@/lib/redis"

// Approved devices only (ADR-018): tell the owner straight away when someone
// is waiting at a new device, so a cashier isn't left standing at the till.
// At most one email per staff member every 10 minutes (repeated sign-in
// attempts each open a new request). Never throws.

const THROTTLE_SEC = 10 * 60
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)

export async function emailOwnerAboutDeviceRequest(args: { organizationId: string; userId: string; deviceName: string; code: string }): Promise<void> {
  try {
    const key = `devreq-mail:${args.organizationId}:${args.userId}`
    if (redis && (await redis.get(key))) return
    const owner = await ownerContact(args.organizationId)
    if (!owner?.email) return
    const db = dbAdmin()
    const [[who], [org]] = await Promise.all([
      db.select({ name: user.name, role: staff_profile.role }).from(user).leftJoin(staff_profile, eq(staff_profile.user_id, user.id)).where(eq(user.id, args.userId)).limit(1),
      db.select({ name: organization.name }).from(organization).where(eq(organization.id, args.organizationId)).limit(1),
    ])
    if (who?.role === "owner") return
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://pharmatrack.co.ke").replace(/\/$/, "")
    const name = who?.name || "A staff member"
    const subject = `${name} is waiting to use PharmaTrack on a new device`
    const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:15px;line-height:1.6;color:#111827;max-width:520px">
<p>Hi ${esc(owner.name?.split(" ")[0] || "there")},</p>
<p><strong>${esc(name)}</strong>${who?.role ? ` (${esc(who.role)})` : ""} is trying to use ${esc(org?.name ?? "your pharmacy")} on <strong>${esc(args.deviceName)}</strong>, which isn't approved yet.</p>
<p>The code on their screen is <strong style="font-size:18px;letter-spacing:2px">${esc(formatPairingCode(args.code))}</strong>. To let it in:</p>
<ul><li>enter your PIN on that device, or</li><li>approve it from <a href="${appUrl}/settings?tab=devices" style="color:#15803d">Settings → Devices</a> after checking the code matches.</li></ul>
<p style="color:#6b7280;font-size:13px">If you don't recognise this, do nothing — the request expires in 15 minutes and the device stays locked out.</p></div>`
    await sendEmail(owner.email, subject, html)
    if (redis) await redis.set(key, 1, { ex: THROTTLE_SEC })
  } catch {
    // a missed email never blocks the request itself
  }
}
