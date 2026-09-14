import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { and, asc, eq, ilike, isNull } from "drizzle-orm"
import { withTenant, category } from "@pharmatrack/db"
import { getTenantContext, type Role, requireActiveSubscription } from "@/lib/auth/helpers"
import { zUuid } from "@/lib/api/validation"

const createSchema = z.object({
  name: z.string().trim().min(1, "Category name is required").max(60),
  parent_id: zUuid().nullable().optional(),
})

const WRITE_ROLES: Role[] = ["owner", "manager", "pharmacist"]

export async function GET() {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const subErr = await requireActiveSubscription(ctx.organizationId)
  if (subErr) return subErr

  const rows = await withTenant(ctx, (db) =>
    db.select({ id: category.id, name: category.name, parent_id: category.parent_id })
      .from(category).orderBy(asc(category.name)))
  return NextResponse.json({ categories: rows })
}

export async function POST(request: NextRequest) {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const subErr = await requireActiveSubscription(ctx.organizationId)
  if (subErr) return subErr
  if (!WRITE_ROLES.includes(ctx.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const parsed = createSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 })
  const { name, parent_id } = parsed.data

  const out = await withTenant(ctx, async (db) => {
    // Enforce two-level depth: parent must exist in-org and itself be top-level.
    if (parent_id) {
      const [parent] = await db.select({ parent_id: category.parent_id }).from(category).where(eq(category.id, parent_id)).limit(1)
      if (!parent) return { status: 400 as const, body: { error: "Parent category not found" } }
      if (parent.parent_id) return { status: 400 as const, body: { error: "Subcategories can only be one level deep" } }
    }
    // Friendly duplicate guard within the same parent scope (case-insensitive).
    const [dup] = await db.select({ id: category.id }).from(category)
      .where(and(ilike(category.name, name), parent_id ? eq(category.parent_id, parent_id) : isNull(category.parent_id))).limit(1)
    if (dup) return { status: 409 as const, body: { error: `"${name}" already exists here` } }

    const [row] = await db.insert(category).values({ organization_id: ctx.organizationId, name, parent_id: parent_id ?? null })
      .returning({ id: category.id, name: category.name, parent_id: category.parent_id })
    return { status: 201 as const, body: { category: row } }
  })
  return NextResponse.json(out.body, { status: out.status })
}
