import { NextResponse } from "next/server"
import { getApiContext } from "@/lib/api-auth"
import { pendingRequests } from "@/lib/devices/pairing"

// Devices waiting for approval (ADR-018) — Settings → Devices and the bell.
export async function GET() {
  const ctx = await getApiContext({ permission: "devices.manage" })
  if ("error" in ctx) return ctx.error
  const rows = await pendingRequests(ctx.organizationId)
  return NextResponse.json({
    requests: rows.map((r) => ({ ...r, created_at: r.created_at.toISOString(), expires_at: r.expires_at.toISOString() })),
  })
}
