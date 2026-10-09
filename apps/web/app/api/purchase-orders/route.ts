import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { and, desc, eq, inArray, sql } from "drizzle-orm"
import { withTenant, purchase_order, purchase_order_item, supplier, branch } from "@pharmatrack/db"
import { getApiContext } from "@/lib/api-auth"
import { zUuid } from "@/lib/api/validation"
import { resolveBranchScope } from "@/lib/inventory/aggregate"
import { formatPoNumber } from "@/lib/purchasing/suggest"
import { serializePo } from "@/lib/purchasing/serialize"
import { poItemInput, buildPoLines } from "@/lib/purchasing/lines"

const createSchema = z.object({
  branch_id: zUuid(),
  supplier_id: zUuid().nullable().optional(),
  expected_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  items: z.array(poItemInput).min(1).max(500),
})

const STATUSES = ["draft", "sent", "partially_received", "received", "cancelled"] as const

// GET /api/purchase-orders?status=open|draft|sent|...&branch_id=
export async function GET(request: NextRequest) {
  const ctx = await getApiContext({ permission: ["purchasing.manage", "purchasing.receive"] })
  if ("error" in ctx) return ctx.error
  const sp = new URL(request.url).searchParams
  const status = sp.get("status") ?? "all"
  const branchId = resolveBranchScope(ctx, sp.get("branch_id"))
  const canSeeCost = ctx.permissions.includes("cost.view")

  return withTenant(ctx, async (db) => {
    const statusFilter =
      status === "open" ? inArray(purchase_order.status, ["draft", "sent", "partially_received"])
      : (STATUSES as readonly string[]).includes(status) ? eq(purchase_order.status, status)
      : undefined
    const rows = await db.select({
      po: purchase_order, supplier_name: supplier.name, branch_name: branch.name,
    }).from(purchase_order)
      .leftJoin(supplier, eq(supplier.id, purchase_order.supplier_id))
      .leftJoin(branch, eq(branch.id, purchase_order.branch_id))
      .where(and(statusFilter, branchId ? eq(purchase_order.branch_id, branchId) : undefined))
      .orderBy(desc(purchase_order.created_at))
      .limit(200)

    const ids = rows.map((r) => r.po.id)
    const totals = ids.length === 0 ? [] : await db.select({
      id: purchase_order_item.purchase_order_id,
      count: sql<number>`count(*)::int`,
      total: sql<string | null>`sum(${purchase_order_item.unit_cost} * ${purchase_order_item.quantity_ordered})`,
    }).from(purchase_order_item).where(inArray(purchase_order_item.purchase_order_id, ids))
      .groupBy(purchase_order_item.purchase_order_id)
    const byId = new Map(totals.map((t) => [t.id, t]))

    const orders = rows.map(({ po, supplier_name, branch_name }) => {
      const t = byId.get(po.id)
      return serializePo(po, {
        supplier_name, branch_name,
        items: { count: t?.count ?? 0, total: canSeeCost && t?.total != null ? Number(t.total) : null },
      })
    })
    return NextResponse.json({ orders })
  })
}

export async function POST(request: NextRequest) {
  const ctx = await getApiContext({ permission: "purchasing.manage" })
  if ("error" in ctx) return ctx.error
  const parsed = createSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 })
  const d = parsed.data
  if (ctx.branchLocked && d.branch_id !== ctx.branchId) {
    return NextResponse.json({ error: "You can only order for your own branch" }, { status: 403 })
  }

  try {
    const created = await withTenant(ctx, async (db) => {
      const seqRows = (await db.execute(sql`select nextval('purchase_order_number_seq')::int as n`)) as unknown as Array<{ n: number }>
      const [po] = await db.insert(purchase_order).values({
        organization_id: ctx.organizationId,
        branch_id: d.branch_id,
        supplier_id: d.supplier_id ?? null,
        po_number: formatPoNumber(seqRows[0]!.n),
        expected_date: d.expected_date ?? null,
        notes: d.notes ?? null,
        created_by: ctx.userId,
      }).returning()
      const lines = await buildPoLines(db, d.items, ctx.permissions.includes("cost.view"))
      await db.insert(purchase_order_item).values(lines.map((l) => ({ ...l, purchase_order_id: po!.id })))
      return po!
    })
    return NextResponse.json({ id: created.id, po_number: created.po_number }, { status: 201 })
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Unknown product")) {
      return NextResponse.json({ error: "One of the products no longer exists" }, { status: 400 })
    }
    throw err
  }
}
