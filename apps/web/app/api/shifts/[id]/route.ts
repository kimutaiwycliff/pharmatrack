import { NextRequest, NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { withTenant, shift, sale, user, staff_profile } from "@pharmatrack/db"
import { getTenantContext } from "@/lib/auth/helpers"
import { serializeShift } from "@/lib/shifts/serialize"

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  return withTenant(ctx, async (db) => {
    const [found] = await db.select({ row: shift, full_name: user.name, role: staff_profile.role })
      .from(shift)
      .leftJoin(user, eq(user.id, shift.cashier_id))
      .leftJoin(staff_profile, eq(staff_profile.user_id, shift.cashier_id))
      .where(eq(shift.id, id)).limit(1)
    if (!found) return NextResponse.json({ error: "Shift not found" }, { status: 404 })

    const sales = await db.select({ total_amount: sale.total_amount, payment_method: sale.payment_method })
      .from(sale).where(and(eq(sale.shift_id, id), eq(sale.status, "completed")))

    const totals = sales.reduce((acc, s) => {
      acc.count += 1; acc.total += Number(s.total_amount)
      if (s.payment_method === "cash") acc.cash += Number(s.total_amount)
      if (s.payment_method === "mpesa") acc.mpesa += Number(s.total_amount)
      if (s.payment_method === "split") acc.split += Number(s.total_amount)
      return acc
    }, { count: 0, total: 0, cash: 0, mpesa: 0, split: 0 })

    const mapped = serializeShift(found.row)
    const variance = mapped.closing_cash != null ? mapped.closing_cash - (mapped.opening_float + totals.cash) : null

    return NextResponse.json({
      shift: {
        ...mapped,
        profiles: { full_name: found.full_name ?? "—", role: found.role ?? "cashier" },
        sale_count: totals.count, total_sales: totals.total,
        cash_sales: totals.cash, mpesa_sales: totals.mpesa, split_sales: totals.split, variance,
      },
    })
  })
}
