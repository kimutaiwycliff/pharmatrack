import { NextResponse } from "next/server"
import { getTenantContext } from "@/lib/auth/helpers"
import { apiError } from "@/lib/api/errors"
import { loadReceiptProfile } from "@/lib/receipt/profile"

// GET /api/receipt-profile — how this pharmacy's receipts are branded
// (Settings → Receipt). Any signed-in staff member: every till prints them.
// Edited through PATCH /api/settings?target=receipt.
export async function GET() {
  const ctx = await getTenantContext()
  if (!ctx) return apiError("Unauthorized", 401)
  return NextResponse.json(await loadReceiptProfile(ctx.organizationId), {
    headers: { "Cache-Control": "private, max-age=60" },
  })
}
