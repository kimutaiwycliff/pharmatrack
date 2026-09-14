import { NextRequest, NextResponse } from "next/server"
import { and, eq, inArray } from "drizzle-orm"
import { withTenant, shift, sale, payment, user, staff_profile } from "@pharmatrack/db"
import { getTenantContext, requireActiveSubscription } from "@/lib/auth/helpers"
import { serializeShift } from "@/lib/shifts/serialize"

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const subErr = await requireActiveSubscription(ctx.organizationId)
  if (subErr) return subErr

  return withTenant(ctx, async (db) => {
    const [found] = await db.select({ row: shift, full_name: user.name, role: staff_profile.role })
      .from(shift)
      .leftJoin(user, eq(user.id, shift.cashier_id))
      .leftJoin(staff_profile, eq(staff_profile.user_id, shift.cashier_id))
      .where(eq(shift.id, id)).limit(1)
    if (!found) return NextResponse.json({ error: "Shift not found" }, { status: 404 })

    const sales = await db.select({ id: sale.id, total_amount: sale.total_amount, payment_method: sale.payment_method })
      .from(sale).where(and(eq(sale.shift_id, id), eq(sale.status, "completed")))

    const totals = sales.reduce((acc, s) => {
      acc.count += 1; acc.total += Number(s.total_amount)
      if (s.payment_method === "split") acc.split += Number(s.total_amount)
      return acc
    }, { count: 0, total: 0, cash: 0, mpesa: 0, split: 0 })

    // Real per-method totals from the payment table - correctly includes the
    // cash/mpesa portions of split-tender sales (sale.payment_method alone
    // can't tell you how much of a split sale was cash).
    const saleIds = sales.map((s) => s.id)
    if (saleIds.length > 0) {
      const payRows = await db.select({ method: payment.method, amount: payment.amount })
        .from(payment).where(inArray(payment.sale_id, saleIds))
      for (const p of payRows) {
        if (p.method === "cash") totals.cash += Number(p.amount)
        if (p.method === "mpesa") totals.mpesa += Number(p.amount)
      }
    }

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
