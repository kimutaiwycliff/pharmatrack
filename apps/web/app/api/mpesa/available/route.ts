import { NextResponse } from "next/server"
import { getTenantContext } from "@/lib/auth/helpers"
import { mpesaStkAvailability } from "@/lib/mpesa/config"

// Lightweight check any staff can call so the POS knows whether to offer STK push
// (vs manual confirm). Available = plan includes STK (Growth+) AND config is on.
export async function GET() {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  return NextResponse.json(await mpesaStkAvailability(ctx.organizationId))
}
