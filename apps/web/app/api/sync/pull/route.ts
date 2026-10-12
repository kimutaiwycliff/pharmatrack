import { NextRequest, NextResponse } from "next/server"
import { withTenant } from "@pharmatrack/db"
import { getDeviceContext } from "@/lib/sync/device-auth"
import { buildPull } from "@/lib/sync/pull"

// GET /api/sync/pull?since=<cursor>&after_ts=&after_id=&refresh_allocation=1
// Device-authenticated delta download (see lib/sync/pull.ts).
export async function GET(request: NextRequest) {
  const ctx = await getDeviceContext(request)
  if ("error" in ctx) return ctx.error
  const sp = request.nextUrl.searchParams
  const parse = (v: string | null) => {
    if (!v) return null
    const d = new Date(v)
    return isNaN(d.getTime()) ? undefined : d
  }
  const since = parse(sp.get("since"))
  const afterTs = parse(sp.get("after_ts"))
  if (since === undefined || afterTs === undefined) return NextResponse.json({ error: "Invalid cursor", code: "bad_cursor" }, { status: 400 })
  const afterId = sp.get("after_id")

  const body = await withTenant(ctx.tenant, (db) => buildPull(db, ctx.device, {
    since,
    after: afterTs && afterId ? { ts: afterTs, id: afterId } : null,
    refreshAllocation: sp.get("refresh_allocation") === "1",
  }))
  return NextResponse.json(body)
}
