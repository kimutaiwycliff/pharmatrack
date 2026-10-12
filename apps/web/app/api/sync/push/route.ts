import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { dbAdmin, device } from "@pharmatrack/db"
import { getDeviceContext } from "@/lib/sync/device-auth"
import { pushBody } from "@/lib/sync/push-schema"
import { processPush } from "@/lib/sync/push"

// POST /api/sync/push — device uploads shifts/sales/overrides in order and gets
// a result per item (synced / duplicate / rejected / retry). See lib/sync/push.ts.
export async function POST(request: NextRequest) {
  const ctx = await getDeviceContext(request)
  if ("error" in ctx) return ctx.error
  const parsed = pushBody.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request", code: "invalid" }, { status: 400 })

  const results = await processPush(ctx, parsed.data.items)
  if (parsed.data.app_version) {
    void dbAdmin().update(device).set({ app_version: parsed.data.app_version }).where(eq(device.id, ctx.device.id)).catch(() => {})
  }
  return NextResponse.json({ results, server_time: new Date().toISOString() })
}
