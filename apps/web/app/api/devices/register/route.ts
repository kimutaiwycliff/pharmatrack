import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { eq, sql } from "drizzle-orm"
import { withTenant, device, branch, audit_log } from "@pharmatrack/db"
import { getApiContext } from "@/lib/api-auth"
import { zUuid } from "@/lib/api/validation"
import { hashDeviceToken, newDeviceToken } from "@/lib/sync/device-auth"

// A manager/owner signed in on the phone registers it for offline selling.
// Returns the device token ONCE — the app keeps it in secure storage.
const schema = z.object({
  name: z.string().trim().min(2).max(60),
  branch_id: zUuid().optional(),
  platform: z.string().max(20).optional(),
  app_version: z.string().max(40).optional(),
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
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const out = await withTenant(ctx, async (db) => {
        const [b] = await db.select({ id: branch.id, name: branch.name }).from(branch).where(eq(branch.id, branchId)).limit(1)
        if (!b) return null
        const [{ n }] = (await db.select({ n: sql<number>`count(*)::int` }).from(device)) as [{ n: number }]
        const code = `D${String(n + 1 + attempt).padStart(2, "0")}`
        const [row] = await db.insert(device).values({
          organization_id: ctx.organizationId, branch_id: b.id, name: d.name, device_code: code,
          token_hash: hashDeviceToken(token), platform: d.platform ?? null, app_version: d.app_version ?? null,
          registered_by: ctx.userId, last_seen_at: new Date(),
        }).returning()
        await db.insert(audit_log).values({
          organization_id: ctx.organizationId, actor_id: ctx.userId, action: "device.register",
          entity: "device", entity_id: row!.id, diff: { name: d.name, code, branch: b.name },
        })
        return { device: { id: row!.id, name: row!.name, code, branch_id: b.id, branch_name: b.name }, token }
      })
      if (!out) return NextResponse.json({ error: "Branch not found" }, { status: 400 })
      return NextResponse.json(out, { status: 201 })
    } catch (err) {
      // Device code taken by a concurrent registration — try the next one.
      if (typeof err === "object" && err && "code" in err && (err as { code?: string }).code === "23505") continue
      throw err
    }
  }
  return NextResponse.json({ error: "Couldn't allocate a device code, try again" }, { status: 503 })
}
