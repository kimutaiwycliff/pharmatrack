import { NextResponse } from "next/server"
import { and, desc, eq, isNull, inArray } from "drizzle-orm"
import { withTenant, shift, sale, payment } from "@pharmatrack/db"
import { getTenantContext } from "@/lib/auth/helpers"
import { serializeShift } from "@/lib/shifts/serialize"

// The open (not-yet-clocked-out) shift for the signed-in cashier, or null.
// Includes cash_sales so far (real cash collected, from the payment table —
// see shifts/route.ts for why this can't just filter sale.payment_method) so
// the close-shift dialog can preview expected cash / variance live, before
// the cashier commits to a closing count.
export async function GET() {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  return withTenant(ctx, async (db) => {
    const [row] = await db.select().from(shift)
      .where(and(eq(shift.cashier_id, ctx.userId), isNull(shift.closed_at)))
      .orderBy(desc(shift.opened_at)).limit(1)

    if (!row) return NextResponse.json({ shift: null, cashSales: 0 })

    const sales = await db.select({ id: sale.id })
      .from(sale).where(and(eq(sale.shift_id, row.id), eq(sale.status, "completed")))
    let cashSales = 0
    if (sales.length > 0) {
      const payRows = await db.select({ amount: payment.amount })
        .from(payment).where(and(inArray(payment.sale_id, sales.map((s) => s.id)), eq(payment.method, "cash")))
      cashSales = payRows.reduce((sum, p) => sum + Number(p.amount), 0)
    }

    return NextResponse.json({ shift: serializeShift(row), cashSales })
  })
}
