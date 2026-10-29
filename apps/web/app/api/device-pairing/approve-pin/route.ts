import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { approveRequest, approversFor, checkApproverPin, requestBySecret } from "@/lib/devices/pairing"
import { deviceCookie } from "@/lib/devices/lock"
import { zUuid } from "@/lib/api/validation"

// Approve on the spot (ADR-018): the owner (or, if the pharmacy allows it, a
// manager with "Manage selling devices") types their own till PIN on the
// blocked device, and picks how long the approval lasts. Wrong PINs count
// toward the same 5-try lockout as PIN sign-in for that person.
const schema = z.object({
  secret: z.string().min(20).max(200),
  approver_id: z.string().min(1).max(100),
  pin: z.string().regex(/^\d{4,8}$/, "Enter the 4-digit PIN"),
  name: z.string().trim().min(2, "Give the device a name").max(60),
  branch_id: zUuid(),
  purpose: z.enum(["till", "office"]),
  duration: z.enum(["today", "week", "always"]).default("always"),
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

  const pinErr = await checkApproverPin(row.organization_id, approver, d.pin)
  if (pinErr) return NextResponse.json(pinErr.body, { status: pinErr.status, ...(pinErr.retryAfter ? { headers: { "retry-after": String(pinErr.retryAfter) } } : {}) })

  // A manager tied to one branch can only approve devices for that branch.
  const branchId = approver.all_branches || !approver.branch_id ? d.branch_id : approver.branch_id
  const created = await approveRequest(row, { name: d.name, branchId, purpose: d.purpose, approverId: approver.id, via: "pin", duration: d.duration })
  if (created === "gone") return NextResponse.json({ error: "This request was already decided.", code: "request_gone" }, { status: 410 })
  if (created === "branch") return NextResponse.json({ error: "Pick a branch of this pharmacy." }, { status: 400 })

  const res = NextResponse.json({ status: "approved", device: { ...created, organization_id: row.organization_id } })
  if (d.platform !== "android") res.headers.append("Set-Cookie", deviceCookie(d.secret))
  return res
}
