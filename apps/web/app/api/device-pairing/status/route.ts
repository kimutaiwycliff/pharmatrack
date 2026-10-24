import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { eq } from "drizzle-orm"
import { dbAdmin, device, branch } from "@pharmatrack/db"
import { requestBySecret, requestContext } from "@/lib/devices/pairing"
import { deviceCookie } from "@/lib/devices/lock"
import { rateLimit, clientIp, tooManyRequests, retryText } from "@/lib/rate-limit"

// The blocked device asks "am I approved yet?" (ADR-018). No session exists
// yet, so the request secret — 256 random bits only this device holds — is the
// credential. Pending: what to show while waiting (pharmacy, matching code,
// who can approve with a PIN). Approved: the device, and for a browser the
// httpOnly key cookie, so the next sign-in goes through.
const schema = z.object({
  secret: z.string().min(20).max(200),
  /** Android keeps its key in secure storage instead of a cookie. */
  platform: z.enum(["web", "desktop", "android"]).optional(),
})

export async function POST(request: NextRequest) {
  const r = await rateLimit(`pairing:status:${clientIp(request)}`, 120, 60)
  if (!r.ok) return tooManyRequests(`Too many checks — try again in ${retryText(r.retryAfter)}.`, r.retryAfter)
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 })

  const row = await requestBySecret(parsed.data.secret)
  if (!row) return NextResponse.json({ status: "unknown" }, { status: 404 })

  if (row.status === "pending") {
    return NextResponse.json({ status: "pending", code: row.code, expires_at: row.expires_at.toISOString(), context: await requestContext(row) })
  }
  if (row.status !== "approved" || !row.device_id) return NextResponse.json({ status: row.status })

  const [dev] = await dbAdmin().select({
    id: device.id, name: device.name, code: device.device_code, branch_id: device.branch_id, purpose: device.purpose,
    organization_id: device.organization_id, revoked_at: device.revoked_at, branch_name: branch.name,
  }).from(device).leftJoin(branch, eq(branch.id, device.branch_id)).where(eq(device.id, row.device_id)).limit(1)
  if (!dev || dev.revoked_at) return NextResponse.json({ status: "revoked" })

  const out = { id: dev.id, name: dev.name, code: dev.code, branch_id: dev.branch_id, branch_name: dev.branch_name, purpose: dev.purpose, organization_id: dev.organization_id }
  const res = NextResponse.json({ status: "approved", device: out })
  if (parsed.data.platform !== "android") res.headers.append("Set-Cookie", deviceCookie(parsed.data.secret))
  return res
}
