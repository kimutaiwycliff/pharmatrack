import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { and, eq } from "drizzle-orm"
import { audit_log, dbAdmin, device_request, user } from "@pharmatrack/db"
import { canApproveDevices } from "@pharmatrack/core"
import { loadDeviceLock } from "@/lib/devices/lock"
import { getApiContext } from "@/lib/api-auth"
import { zUuid } from "@/lib/api/validation"
import { approveRequest, checkApproverPin, requestById, deviceUseFields } from "@/lib/devices/pairing"

// Approve or decline a device remotely (ADR-018), after checking the 6-digit
// code on the waiting device matches. The device picks up the decision on its
// next status check — no secret ever passes through this route.
const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("approve"),
    name: z.string().trim().min(2, "Give the device a name").max(60),
    branch_id: zUuid(),
    purpose: z.enum(["till", "office"]),
    duration: z.enum(["today", "week", "always"]).default("always"),
    use: z.enum(["till", "office", "all"]).optional(),
    /** The approver's own till PIN — a tap alone can't let a device in. */
    pin: z.string({ error: "Enter your PIN to approve this device" }).regex(/^\d{4,8}$/, "Enter your 4-digit PIN"),
  }),
  z.object({ action: z.literal("decline") }),
])

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getApiContext({ permission: "devices.manage" })
  if ("error" in ctx) return ctx.error
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 })
  const d = parsed.data

  const row = await requestById(id, ctx.organizationId)
  if (!row) return NextResponse.json({ error: "Request not found" }, { status: 404 })
  if (row.status !== "pending") {
    return NextResponse.json({ error: row.status === "expired" ? "This request expired — ask them to sign in again." : "This request was already decided." }, { status: 410 })
  }

  if (d.action === "decline") {
    const done = await dbAdmin().update(device_request).set({ status: "declined", decided_by: ctx.userId, decided_via: "remote", decided_at: new Date() })
      .where(and(eq(device_request.id, row.id), eq(device_request.status, "pending"))).returning({ id: device_request.id })
    if (done.length) {
      await dbAdmin().insert(audit_log).values({
        organization_id: ctx.organizationId, actor_id: ctx.userId, action: "device.decline", entity: "device_request", entity_id: row.id,
        diff: { requested_by: row.user_id, name: row.suggested_name },
      })
    }
    return NextResponse.json({ ok: true })
  }

  // Only the owner — or managers, if the pharmacy allows it — and only with their PIN.
  const lock = await loadDeviceLock(ctx.organizationId)
  if (!canApproveDevices(lock, ctx.role, ctx.permissions)) {
    return NextResponse.json({ error: "Only the pharmacy owner can approve devices.", code: "owner_only" }, { status: 403 })
  }
  const [me] = await dbAdmin().select({ name: user.name }).from(user).where(eq(user.id, ctx.userId)).limit(1)
  const pinErr = await checkApproverPin(ctx.organizationId, { id: ctx.userId, name: me?.name || "You" }, d.pin)
  if (pinErr) return NextResponse.json(pinErr.body, { status: pinErr.status })

  // Branch-locked approvers can only add devices to their own branch.
  const branchId = ctx.branchLocked && ctx.branchId ? ctx.branchId : d.branch_id
  const created = await approveRequest(row, { name: d.name, branchId, ...deviceUseFields(d.use, d.purpose, row.platform), approverId: ctx.userId, via: "remote", duration: d.duration })
  if (created === "gone") return NextResponse.json({ error: "This request was already decided." }, { status: 410 })
  if (created === "branch") return NextResponse.json({ error: "Pick a branch of this pharmacy." }, { status: 400 })
  return NextResponse.json({ ok: true, device: created })
}
