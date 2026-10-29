import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { and, eq } from "drizzle-orm"
import { withTenant, mpesa_stk_request } from "@pharmatrack/db"
import { getTenantContext } from "@/lib/auth/helpers"
import { refreshStkRequest } from "@/lib/mpesa/refresh"
import { stkOutcome } from "@/lib/mpesa/stk"

// The till polls this while the customer has the M-Pesa prompt open.
const query = z.object({ id: z.string().min(1).max(100) })

export async function GET(request: NextRequest) {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const parsed = query.safeParse({ id: request.nextUrl.searchParams.get("id") })
  if (!parsed.success) return NextResponse.json({ error: "id required" }, { status: 400 })

  // Own pharmacy's request only (RLS); the refresh itself runs as admin.
  const [row] = await withTenant(ctx, (db) => db.select().from(mpesa_stk_request)
    .where(and(eq(mpesa_stk_request.checkout_request_id, parsed.data.id), eq(mpesa_stk_request.organization_id, ctx.organizationId)))
    .limit(1))
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const fresh = await refreshStkRequest(row)
  const outcome = fresh.status === "pending" ? stkOutcome(null) : stkOutcome(fresh.result_code, fresh.result_desc)
  return NextResponse.json({
    status: fresh.status,
    message: outcome.message,
    receipt: fresh.mpesa_receipt,
    amount: Number(fresh.amount),
    used: fresh.sale_id !== null,
  })
}
