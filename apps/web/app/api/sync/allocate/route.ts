import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { withTenant } from "@pharmatrack/db"
import { zUuid } from "@/lib/api/validation"
import { getDeviceContext } from "@/lib/sync/device-auth"
import { topUpAllocation } from "@/lib/sync/allocation"

// POST /api/sync/allocate — an online device ran out of its share of a product
// and asks for more from stock no other device (or the web till) holds.
const schema = z.object({ product_id: zUuid(), quantity: z.number().int().positive().max(100_000) })

export async function POST(request: NextRequest) {
  const ctx = await getDeviceContext(request)
  if ("error" in ctx) return ctx.error
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid request", code: "invalid" }, { status: 400 })
  const out = await withTenant(ctx.tenant, (db) => topUpAllocation(db, ctx.device, parsed.data.product_id, parsed.data.quantity))
  return NextResponse.json({ granted: out.granted, allowance: out.allowance, reserved_until: out.reservedUntil.toISOString() })
}
