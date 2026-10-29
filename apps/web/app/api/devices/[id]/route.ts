import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { eq } from "drizzle-orm"
import { withTenant, device, device_stock_allocation, audit_log } from "@pharmatrack/db"
import { getApiContext } from "@/lib/api-auth"
import { canApproveDevices } from "@pharmatrack/core"
import { endSessionsForDevice, forgetDevice, loadDeviceLock } from "@/lib/devices/lock"
import { deviceUseFields } from "@/lib/devices/pairing"

// Rename, pin a stock share, or revoke a registered device. Revoking releases
// its stock allowance immediately, the device can no longer sync, and anyone
// signed in on it is signed out (ADR-018).
const schema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  allocation_percent: z.number().min(0).max(100).nullable().optional(),
  revoke: z.literal(true).optional(),
  /** Till only / Back office / Everything (ADR-018 part 2). */
  use: z.enum(["till", "office", "all"]).optional(),
})

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getApiContext({ permission: "devices.manage" })
  if ("error" in ctx) return ctx.error
  const parsed = schema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 })
  const d = parsed.data

  // Changing what a device may do is an approval decision.
  if (d.use) {
    const lock = await loadDeviceLock(ctx.organizationId)
    if (lock.enabled && !canApproveDevices(lock, ctx.role, ctx.permissions)) {
      return NextResponse.json({ error: "Only the pharmacy owner can change what a device is used for.", code: "owner_only" }, { status: 403 })
    }
  }

  const out = await withTenant(ctx, async (db) => {
    const [row] = await db.select().from(device).where(eq(device.id, id)).limit(1)
    if (!row) return null
    if (d.use === "office" && row.platform === "android") return "android_office" as const
    const use = d.use ? deviceUseFields(d.use, row.purpose as "till" | "office", row.platform) : null
    await db.update(device).set({
      ...(d.name ? { name: d.name } : {}),
      ...(d.allocation_percent !== undefined ? { allocation_percent: d.allocation_percent == null ? null : String(d.allocation_percent) } : {}),
      ...(d.revoke ? { revoked_at: new Date() } : {}),
      ...(use ? { purpose: use.purpose, access: use.access } : {}),
    }).where(eq(device.id, id))
    if (d.revoke) await db.delete(device_stock_allocation).where(eq(device_stock_allocation.device_id, id))
    await db.insert(audit_log).values({
      organization_id: ctx.organizationId, actor_id: ctx.userId, action: d.revoke ? "device.revoke" : "device.update",
      entity: "device", entity_id: id, diff: d,
    })
    return true
  })
  if (!out) return NextResponse.json({ error: "Device not found" }, { status: 404 })
  if (out === "android_office") return NextResponse.json({ error: "Phones sell at the till — they can't be back-office only." }, { status: 400 })
  forgetDevice(id)
  const signedOut = d.revoke ? await endSessionsForDevice(id) : 0
  return NextResponse.json({ ok: true, signed_out: signedOut })
}
