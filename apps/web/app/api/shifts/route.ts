import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { and, desc, eq, gte, lte, inArray, isNull } from "drizzle-orm"
import { withTenant, shift, sale, user, staff_profile } from "@pharmatrack/db"
import { getTenantContext } from "@/lib/auth/helpers"
import { zUuid } from "@/lib/api/validation"
import { serializeShift } from "@/lib/shifts/serialize"

const clockInSchema = z.object({
  branch_id: zUuid().optional(),
  opening_float: z.number().nonnegative(),
})

const clockOutSchema = z.object({
  shift_id: zUuid(),
  closing_cash: z.number().nonnegative(),
  notes: z.string().optional(),
})

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const branchId = searchParams.get("branch_id")
  const from = searchParams.get("from")
  const to = searchParams.get("to")
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"))
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "20")))
  if (!branchId) return NextResponse.json({ error: "branch_id required" }, { status: 400 })

  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  return withTenant(ctx, async (db) => {
    const where = and(
      eq(shift.branch_id, branchId),
      ctx.role === "cashier" ? eq(shift.cashier_id, ctx.userId) : undefined,
      from ? gte(shift.opened_at, new Date(from)) : undefined,
      to ? lte(shift.opened_at, new Date(to)) : undefined,
    )

    const all = await db.select({
      row: shift, full_name: user.name, role: staff_profile.role,
    }).from(shift)
      .leftJoin(user, eq(user.id, shift.cashier_id))
      .leftJoin(staff_profile, eq(staff_profile.user_id, shift.cashier_id))
      .where(where).orderBy(desc(shift.opened_at))

    const total = all.length
    const offset = (page - 1) * limit
    const pageRows = all.slice(offset, offset + limit)
    const shiftIds = pageRows.map((r) => r.row.id)

    const salesByShift: Record<string, { count: number; total: number; cash: number; mpesa: number }> = {}
    if (shiftIds.length > 0) {
      const sales = await db.select({ shift_id: sale.shift_id, total_amount: sale.total_amount, payment_method: sale.payment_method })
        .from(sale).where(and(inArray(sale.shift_id, shiftIds), eq(sale.status, "completed")))
      for (const s of sales) {
        if (!s.shift_id) continue
        const e = salesByShift[s.shift_id] ?? { count: 0, total: 0, cash: 0, mpesa: 0 }
        e.count += 1
        e.total += Number(s.total_amount)
        if (s.payment_method === "cash") e.cash += Number(s.total_amount)
        if (s.payment_method === "mpesa") e.mpesa += Number(s.total_amount)
        salesByShift[s.shift_id] = e
      }
    }

    const shifts = pageRows.map(({ row, full_name, role }) => {
      const t = salesByShift[row.id] ?? { count: 0, total: 0, cash: 0, mpesa: 0 }
      const mapped = serializeShift(row)
      const variance = mapped.closing_cash != null ? mapped.closing_cash - (mapped.opening_float + t.cash) : null
      return {
        ...mapped,
        profiles: { full_name: full_name ?? "—", role: role ?? "cashier" },
        sale_count: t.count, total_sales: t.total, cash_sales: t.cash, mpesa_sales: t.mpesa, variance,
      }
    })

    return NextResponse.json({ shifts, total, page, limit })
  })
}

export async function POST(req: NextRequest) {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = clockInSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 })

  const branchId = parsed.data.branch_id ?? ctx.branchId
  if (!branchId) return NextResponse.json({ error: "No branch assigned to this account" }, { status: 400 })

  const row = await withTenant(ctx, async (db) => {
    const [s] = await db.insert(shift).values({
      organization_id: ctx.organizationId, branch_id: branchId,
      cashier_id: ctx.userId, opening_float: String(parsed.data.opening_float),
    }).returning()
    return s!
  })
  return NextResponse.json({ shift: serializeShift(row) }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = clockOutSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 })

  const out = await withTenant(ctx, async (db) => {
    const [existing] = await db.select().from(shift)
      .where(and(eq(shift.id, parsed.data.shift_id), isNull(shift.closed_at))).limit(1)
    if (!existing || existing.cashier_id !== ctx.userId) return { status: 404 as const, body: { error: "Shift not found or already closed" } }

    // variance = closing cash − (opening float + cash sales this shift)
    const sales = await db.select({ total_amount: sale.total_amount })
      .from(sale).where(and(eq(sale.shift_id, existing.id), eq(sale.status, "completed"), eq(sale.payment_method, "cash")))
    const cashSales = sales.reduce((s, r) => s + Number(r.total_amount), 0)
    const variance = parsed.data.closing_cash - (Number(existing.opening_float) + cashSales)

    const [updated] = await db.update(shift).set({
      closed_at: new Date(), closing_cash: String(parsed.data.closing_cash), variance: String(variance),
    }).where(eq(shift.id, existing.id)).returning()
    return { status: 200 as const, body: { shift: serializeShift(updated!) } }
  })

  return NextResponse.json(out.body, { status: out.status })
}
