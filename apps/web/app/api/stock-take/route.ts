import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm"
import { withTenant, stock_count, stock_count_line, user } from "@pharmatrack/db"
import { zUuid } from "@/lib/api/validation"
import { zodErrorResponse } from "@/lib/api/errors"
import { forbidden } from "@/lib/api-auth"
import { canViewCost } from "@/lib/auth/costVisibility"
import { resolveBranchScope } from "@/lib/inventory/aggregate"
import { listShelves, resolveScope, stockTakeContext } from "@/lib/stockTake/server"

// Stock take (ADR-020): GET the shelves for a branch and the sessions in
// progress; POST starts a session for one shelf (or resumes the open one).

export async function GET(request: NextRequest) {
  const r = await stockTakeContext()
  if ("error" in r) return r.error
  const { ctx } = r
  const branchId = resolveBranchScope(ctx, new URL(request.url).searchParams.get("branch_id"))
  if (!branchId) return NextResponse.json({ error: "Pick a branch first" }, { status: 400 })

  const out = await withTenant(ctx, async (db) => {
    const shelves = await listShelves(db, branchId)
    const sessions = await db.select({
      id: stock_count.id, kind: stock_count.kind, title: stock_count.title, status: stock_count.status,
      updated_at: stock_count.updated_at, posted_at: stock_count.posted_at, totals: stock_count.totals,
      created_by: user.name, lines: sql<number>`(select count(*)::int from ${stock_count_line} where ${stock_count_line.count_id} = ${stock_count.id})`,
    }).from(stock_count).leftJoin(user, eq(user.id, stock_count.created_by))
      .where(and(eq(stock_count.branch_id, branchId), inArray(stock_count.status, ["draft", "review", "posted"])))
      .orderBy(desc(stock_count.updated_at)).limit(30)
    return { shelves, sessions }
  })
  return NextResponse.json({
    ...out,
    can: {
      adjust: ctx.permissions.includes("stock.adjust"),
      setup: ctx.permissions.includes("products.create") && ctx.permissions.includes("stock.receive"),
      viewCost: canViewCost(ctx),
    },
  })
}

const createSchema = z.object({
  branch_id: zUuid(),
  kind: z.enum(["count", "setup"]),
  category_id: zUuid().nullable().optional(),
  taxonomy_key: z.string().max(120).nullable().optional(),
  hide_expected: z.boolean().optional(),
}).refine((d) => d.category_id || d.taxonomy_key, { message: "Pick a shelf" })

export async function POST(request: NextRequest) {
  const r = await stockTakeContext()
  if ("error" in r) return r.error
  const { ctx } = r
  const parsed = createSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return zodErrorResponse(parsed.error)
  const d = parsed.data
  if (d.kind === "setup" && !(ctx.permissions.includes("products.create") && ctx.permissions.includes("stock.receive"))) return forbidden("products.create")
  const branchId = resolveBranchScope(ctx, d.branch_id)
  if (!branchId) return NextResponse.json({ error: "Pick a branch first" }, { status: 400 })

  const out = await withTenant(ctx, async (db) => {
    const scope = await resolveScope(db, d)
    if (!scope) return { status: 400, body: { error: "That shelf doesn't exist" } }
    // One open session per shelf and branch: pick up where someone left off.
    const [open] = await db.select({ id: stock_count.id }).from(stock_count).where(and(
      eq(stock_count.branch_id, branchId), eq(stock_count.kind, d.kind), inArray(stock_count.status, ["draft", "review"]),
      scope.categoryId ? eq(stock_count.scope_category_id, scope.categoryId) : isNull(stock_count.scope_category_id),
      scope.key ? eq(stock_count.scope_key, scope.key) : isNull(stock_count.scope_key),
    )).limit(1)
    if (open) return { status: 200, body: { id: open.id, resumed: true } }
    const [created] = await db.insert(stock_count).values({
      organization_id: ctx.organizationId, branch_id: branchId, kind: d.kind,
      scope_category_id: scope.categoryId, scope_key: scope.key, title: scope.name,
      hide_expected: d.kind === "count" ? d.hide_expected ?? true : false, created_by: ctx.userId,
    }).returning({ id: stock_count.id })
    return { status: 201, body: { id: created!.id, resumed: false } }
  })
  return NextResponse.json(out.body, { status: out.status })
}
