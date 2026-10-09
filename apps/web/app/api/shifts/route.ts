import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { and, asc, desc, eq, gte, lte, inArray, isNull } from "drizzle-orm"
import { withTenant, shift, sale, payment, user, staff_profile, branch, audit_log } from "@pharmatrack/db"
import { getTenantContext, requireActiveSubscription } from "@/lib/auth/helpers"
import { zUuid } from "@/lib/api/validation"
import { serializeShift } from "@/lib/shifts/serialize"
import { resolveBranchScope } from "@/lib/inventory/aggregate"

const clockInSchema = z.object({
  branch_id: zUuid().optional(),
  opening_float: z.number().nonnegative(),
})

const clockOutSchema = z.object({
  shift_id: zUuid(),
  // Required when closing your own shift. Optional when force-closing someone
  // else's (the person who counted the drawer may not be there) — then no
  // variance is recorded rather than a made-up one.
  closing_cash: z.number().nonnegative().optional(),
  notes: z.string().max(1000).optional(),
})

function isUniqueViolation(err: unknown) {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "23505"
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const branchId = searchParams.get("branch_id")
  const from = searchParams.get("from")
  const to = searchParams.get("to")
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"))
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "20")))

  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const subErr = await requireActiveSubscription(ctx.organizationId)
  if (subErr) return subErr
  // null → "All branches"; branch-locked staff are always pinned to their own.
  const scopedBranch = resolveBranchScope(ctx, branchId)

  return withTenant(ctx, async (db) => {
    const where = and(
      scopedBranch ? eq(shift.branch_id, scopedBranch) : undefined,
      !ctx.permissions.includes("shifts.view_all") ? eq(shift.cashier_id, ctx.userId) : undefined,
      from ? gte(shift.opened_at, new Date(from)) : undefined,
      to ? lte(shift.opened_at, new Date(to)) : undefined,
    )

    const all = await db.select({
      row: shift, full_name: user.name, role: staff_profile.role, branch_name: branch.name,
    }).from(shift)
      .leftJoin(branch, eq(branch.id, shift.branch_id))
      .leftJoin(user, eq(user.id, shift.cashier_id))
      .leftJoin(staff_profile, eq(staff_profile.user_id, shift.cashier_id))
      .where(where).orderBy(desc(shift.opened_at))

    const total = all.length
    const offset = (page - 1) * limit
    const pageRows = all.slice(offset, offset + limit)
    const shiftIds = pageRows.map((r) => r.row.id)

    const salesByShift: Record<string, { count: number; total: number; cash: number; mpesa: number }> = {}
    if (shiftIds.length > 0) {
      const sales = await db.select({ id: sale.id, shift_id: sale.shift_id, total_amount: sale.total_amount })
        .from(sale).where(and(inArray(sale.shift_id, shiftIds), eq(sale.status, "completed")))
      const saleToShift = new Map<string, string>()
      for (const s of sales) {
        if (!s.shift_id) continue
        saleToShift.set(s.id, s.shift_id)
        const e = salesByShift[s.shift_id] ?? { count: 0, total: 0, cash: 0, mpesa: 0 }
        e.count += 1
        e.total += Number(s.total_amount)
        salesByShift[s.shift_id] = e
      }

      // Real per-method totals from the payment table - correctly includes
      // the cash/mpesa portions of split-tender sales, unlike filtering on
      // sale.payment_method (which is just "cash"|"mpesa"|"split").
      const saleIds = sales.map((s) => s.id)
      if (saleIds.length > 0) {
        const payRows = await db.select({ sale_id: payment.sale_id, method: payment.method, amount: payment.amount })
          .from(payment).where(inArray(payment.sale_id, saleIds))
        for (const p of payRows) {
          const shiftId = saleToShift.get(p.sale_id)
          const e = shiftId ? salesByShift[shiftId] : undefined
          if (!e) continue
          if (p.method === "cash") e.cash += Number(p.amount)
          if (p.method === "mpesa") e.mpesa += Number(p.amount)
        }
      }
    }

    const shifts = pageRows.map(({ row, full_name, role, branch_name }) => {
      const t = salesByShift[row.id] ?? { count: 0, total: 0, cash: 0, mpesa: 0 }
      const mapped = serializeShift(row)
      const variance = mapped.closing_cash != null ? mapped.closing_cash - (mapped.opening_float + t.cash) : null
      return {
        ...mapped,
        branch_name: branch_name ?? null,
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
  const subErr = await requireActiveSubscription(ctx.organizationId)
  if (subErr) return subErr

  const parsed = clockInSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 })

  // Branch-locked staff always clock in at their own branch. Others use the
  // branch they picked, else their home branch, else (no home branch, e.g. an
  // owner set to "All branches") the org's first active branch.
  let branchId = ctx.branchLocked ? ctx.branchId : parsed.data.branch_id ?? ctx.branchId
  if (!branchId && !ctx.branchLocked) {
    const [first] = await withTenant(ctx, (db) =>
      db.select({ id: branch.id }).from(branch).where(eq(branch.is_active, true)).orderBy(asc(branch.name)).limit(1))
    branchId = first?.id ?? null
  }
  if (!branchId) return NextResponse.json({ error: "No branch assigned to this account" }, { status: 400 })

  // One open shift per person (migration 025). Clocking in while a shift is
  // already open returns that shift instead of opening a duplicate — owners can
  // start a shift from the top bar, the POS gate and the mobile app, and
  // duplicates used to make "End shift" look like it never worked.
  try {
    const out = await withTenant(ctx, async (db) => {
      const [open] = await db.select().from(shift)
        .where(and(eq(shift.cashier_id, ctx.userId), isNull(shift.closed_at))).limit(1)
      if (open) return { row: open, existing: true }
      const [s] = await db.insert(shift).values({
        organization_id: ctx.organizationId, branch_id: branchId,
        cashier_id: ctx.userId, opening_float: String(parsed.data.opening_float),
      }).returning()
      return { row: s!, existing: false }
    })
    return NextResponse.json({ shift: serializeShift(out.row), existing: out.existing }, { status: out.existing ? 200 : 201 })
  } catch (err) {
    // The open shift exists but isn't visible here (branch-locked user whose
    // open shift is on another branch) — the unique index still catches it.
    if (isUniqueViolation(err)) {
      return NextResponse.json({ error: "You already have an open shift on another branch. Close it before starting a new one." }, { status: 409 })
    }
    throw err
  }
}

export async function PATCH(req: NextRequest) {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const subErr = await requireActiveSubscription(ctx.organizationId)
  if (subErr) return subErr

  const parsed = clockOutSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 })

  const out = await withTenant(ctx, async (db) => {
    const [existing] = await db.select().from(shift)
      .where(and(eq(shift.id, parsed.data.shift_id), isNull(shift.closed_at))).limit(1)
    if (!existing) return { status: 404 as const, body: { error: "Shift not found or already closed" } }
    const forceClose = existing.cashier_id !== ctx.userId
    if (forceClose && !ctx.permissions.includes("shifts.close_others")) {
      return { status: 404 as const, body: { error: "Shift not found or already closed" } }
    }
    const closingCash = parsed.data.closing_cash
    if (!forceClose && closingCash == null) {
      return { status: 400 as const, body: { error: "Enter the closing cash amount" } }
    }

    // variance = closing cash − (opening float + actual cash collected this
    // shift). Cash is summed from the payment table (method='cash'), not
    // sale.payment_method === 'cash' - that misses the cash portion of
    // split-tender sales entirely, which would falsely inflate variance.
    const cashPayments = await db.select({ amount: payment.amount })
      .from(payment)
      .innerJoin(sale, eq(sale.id, payment.sale_id))
      .where(and(eq(sale.shift_id, existing.id), eq(sale.status, "completed"), eq(payment.method, "cash")))
    const cashSales = cashPayments.reduce((s, r) => s + Number(r.amount), 0)
    const variance = closingCash == null ? null : closingCash - (Number(existing.opening_float) + cashSales)

    let notes = parsed.data.notes ?? null
    if (forceClose) {
      const [actor] = await db.select({ name: user.name }).from(user).where(eq(user.id, ctx.userId)).limit(1)
      notes = [existing.notes, `Force-closed by ${actor?.name ?? "a manager"}${notes ? `: ${notes}` : ""}`].filter(Boolean).join("\n")
    }

    const [updated] = await db.update(shift).set({
      closed_at: new Date(),
      closing_cash: closingCash == null ? null : String(closingCash),
      variance: variance == null ? null : String(variance),
      notes,
    }).where(and(eq(shift.id, existing.id), isNull(shift.closed_at))).returning()
    if (!updated) return { status: 409 as const, body: { error: "This shift was already closed" } }

    if (forceClose) {
      await db.insert(audit_log).values({
        organization_id: ctx.organizationId, actor_id: ctx.userId, action: "shift.force_close",
        entity: "shift", entity_id: existing.id,
        diff: { cashier_id: existing.cashier_id, closing_cash: closingCash ?? null, variance, cash_sales: cashSales },
      })
    }
    return { status: 200 as const, body: { shift: serializeShift(updated) } }
  })

  return NextResponse.json(out.body, { status: out.status })
}
