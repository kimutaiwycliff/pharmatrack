import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { withTenant } from "@pharmatrack/db"
import { getApiContext } from "@/lib/api-auth"
import { zUuid } from "@/lib/api/validation"
import { hashDeviceToken, newDeviceToken } from "@/lib/sync/device-token"
import { createDevice } from "@/lib/devices/create"
import { deviceCookie } from "@/lib/devices/lock"

// A manager/owner signed in on the phone registers it for offline selling.
// Returns the device token ONCE — the app keeps it in secure storage. A
// browser or desktop app also gets it as the httpOnly `pt_device` cookie, so
// it counts as an approved device for sign-in (ADR-018).
const schema = z.object({
  name: z.string().trim().min(2).max(60),
  branch_id: zUuid().optional(),
  platform: z.string().max(20).optional(),
  app_version: z.string().max(40).optional(),
  purpose: z.enum(["till", "office"]).optional(),
})

export async function POST(request: NextRequest) {
  const ctx = await getApiContext({ permission: "devices.manage" })
  if ("error" in ctx) return ctx.error
  const parsed = schema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 })
  const d = parsed.data
  const branchId = ctx.branchLocked ? ctx.branchId : d.branch_id ?? ctx.branchId
  if (!branchId) return NextResponse.json({ error: "Pick the branch this device sells for" }, { status: 400 })

  const token = newDeviceToken()
  const created = await withTenant(ctx, (db) => createDevice(db, {
    organizationId: ctx.organizationId, branchId, name: d.name, tokenHash: hashDeviceToken(token),
    purpose: d.purpose ?? "till", platform: d.platform ?? null, appVersion: d.app_version ?? null,
    actorId: ctx.userId, action: "device.register",
  }))
  if (!created) return NextResponse.json({ error: "Branch not found" }, { status: 400 })

  const res = NextResponse.json({ device: created, token }, { status: 201 })
  if (d.platform !== "android") res.headers.append("Set-Cookie", deviceCookie(token))
  return res
}
