import { NextResponse } from "next/server"
import { and, desc, eq, isNull } from "drizzle-orm"
import { withTenant, shift } from "@pharmatrack/db"
import { getTenantContext } from "@/lib/auth/helpers"
import { serializeShift } from "@/lib/shifts/serialize"

// The open (not-yet-clocked-out) shift for the signed-in cashier, or null.
export async function GET() {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const row = await withTenant(ctx, async (db) => {
    const [s] = await db.select().from(shift)
      .where(and(eq(shift.cashier_id, ctx.userId), isNull(shift.closed_at)))
      .orderBy(desc(shift.opened_at)).limit(1)
    return s ?? null
  })

  return NextResponse.json({ shift: row ? serializeShift(row) : null })
}
