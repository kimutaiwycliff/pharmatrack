import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { and, eq } from "drizzle-orm"
import { audit_log, dbAdmin, staff_profile } from "@pharmatrack/db"
import { approveRequest, approversFor, requestBySecret } from "@/lib/devices/pairing"
import { deviceCookie } from "@/lib/devices/lock"
import { verifyPin } from "@/lib/auth/pin"
import { normalizeKePhone } from "@/lib/auth/phone"
import { failedAttempt, lockedMessage, succeeded } from "@/lib/auth/lockout"
import { lockRemaining, retryText } from "@/lib/rate-limit"
import { zUuid } from "@/lib/api/validation"

// Approve on the spot (ADR-018): an owner or manager with "Manage selling
// devices" types their own till PIN on the blocked device. Wrong PINs count
// toward the same 5-try lockout as PIN sign-in for that person.
const schema = z.object({
  secret: z.string().min(20).max(200),
  approver_id: z.string().min(1).max(100),
  pin: z.string().regex(/^\d{4,8}$/, "Enter the 4-digit PIN"),
  name: z.string().trim().min(2, "Give the device a name").max(60),
  branch_id: zUuid(),
  purpose: z.enum(["till", "office"]),
  platform: z.enum(["web", "desktop", "android"]).optional(),
})

export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 })
  const d = parsed.data

  const row = await requestBySecret(d.secret)
  if (!row || row.status !== "pending") {
    return NextResponse.json({ error: "This request has expired. Sign in again to start a new one.", code: "request_gone" }, { status: 410 })
  }

  const approver = (await approversFor(row.organization_id)).find((a) => a.id === d.approver_id)
  if (!approver) return NextResponse.json({ error: "That person can't approve devices.", code: "not_approver" }, { status: 403 })

  const [sp] = await dbAdmin().select({ pin_hash: staff_profile.pin_hash, phone: staff_profile.phone })
    .from(staff_profile).where(and(eq(staff_profile.user_id, approver.id), eq(staff_profile.organization_id, row.organization_id))).limit(1)
  if (!sp?.pin_hash) return NextResponse.json({ error: `${approver.name} hasn't set a till PIN yet.`, code: "no_pin" }, { status: 400 })

  // Same lockout key as PIN sign-in (lib/auth/pin-plugin.ts).
  const lockKey = sp.phone ? normalizeKePhone(sp.phone) : `user:${approver.id}`
  const left = await lockRemaining("pin", lockKey)
  if (left > 0) return NextResponse.json({ error: lockedMessage("pin", left), code: "locked" }, { status: 429, headers: { "retry-after": String(Math.ceil(left)) } })
  if (!(await verifyPin(d.pin, sp.pin_hash))) {
    const lockedFor = await failedAttempt("pin", lockKey)
    if (lockedFor > 0) {
      await dbAdmin().insert(audit_log).values({
        organization_id: row.organization_id, actor_id: approver.id, action: "auth.pin_locked", entity: "user", entity_id: approver.id,
        diff: { minutes: lockedFor / 60, during: "device approval" },
      }).catch(() => undefined)
      return NextResponse.json({ error: `Too many wrong PINs. Try again in ${retryText(lockedFor)}.`, code: "locked" }, { status: 429 })
    }
    return NextResponse.json({ error: "Wrong PIN. Try again.", code: "wrong_pin" }, { status: 401 })
  }
  await succeeded("pin", lockKey)

  // A manager tied to one branch can only approve devices for that branch.
  const branchId = approver.all_branches || !approver.branch_id ? d.branch_id : approver.branch_id
  const created = await approveRequest(row, { name: d.name, branchId, purpose: d.purpose, approverId: approver.id, via: "pin" })
  if (created === "gone") return NextResponse.json({ error: "This request was already decided.", code: "request_gone" }, { status: 410 })
  if (created === "branch") return NextResponse.json({ error: "Pick a branch of this pharmacy." }, { status: 400 })

  const res = NextResponse.json({ status: "approved", device: { ...created, organization_id: row.organization_id } })
  if (d.platform !== "android") res.headers.append("Set-Cookie", deviceCookie(d.secret))
  return res
}
