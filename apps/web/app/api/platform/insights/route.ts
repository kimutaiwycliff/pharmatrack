import { NextResponse } from "next/server"
import { getPlatformContext } from "@/lib/platform"
import { buildOverview } from "@/lib/insights/overview"

// GET /api/platform/insights — operator console overview: platform totals,
// the 30-day trend, and per-pharmacy usage + money rollups with a health
// level and follow-up state (lib/insights/overview.ts). Operator-only.
export async function GET() {
  const ctx = await getPlatformContext()
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const o = await buildOverview()
  return NextResponse.json({
    platform: o.platform,
    daily: o.daily,
    tenants: Object.fromEntries(o.tenants.map((t) => [t.id, t])),
  }, { headers: { "Cache-Control": "no-store" } })
}
