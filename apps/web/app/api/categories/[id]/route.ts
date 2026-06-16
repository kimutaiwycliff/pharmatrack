import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { and, eq } from "drizzle-orm"
import { withTenant, category, product } from "@pharmatrack/db"
import { getTenantContext, type Role } from "@/lib/auth/helpers"
import { zUuid } from "@/lib/api/validation"

const updateSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  parent_id: zUuid().nullable().optional(),
})

// Renaming / moving / deleting categories is a management action (owner/manager).
// Inline creation during product entry stays open to pharmacists via POST /api/categories.
const WRITE_ROLES: Role[] = ["owner", "manager"]

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!WRITE_ROLES.includes(ctx.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const parsed = updateSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 })

  const out = await withTenant(ctx.organizationId, async (db) => {
    const [cat] = await db.select({ id: category.id }).from(category).where(eq(category.id, id)).limit(1)
    if (!cat) return { status: 404 as const, body: { error: "Category not found" } }

    // Validate a parent change keeps the tree two levels deep.
    if (parsed.data.parent_id !== undefined && parsed.data.parent_id !== null) {
      if (parsed.data.parent_id === id) return { status: 400 as const, body: { error: "A category cannot be its own parent" } }
      const children = await db.select({ id: category.id }).from(category).where(eq(category.parent_id, id)).limit(1)
      if (children.length > 0) return { status: 400 as const, body: { error: "Move its subcategories out first" } }
      const [parent] = await db.select({ parent_id: category.parent_id }).from(category).where(eq(category.id, parsed.data.parent_id)).limit(1)
      if (!parent) return { status: 400 as const, body: { error: "Parent category not found" } }
      if (parent.parent_id) return { status: 400 as const, body: { error: "Subcategories can only be one level deep" } }
    }

    const [row] = await db.update(category).set(parsed.data).where(eq(category.id, id))
      .returning({ id: category.id, name: category.name, parent_id: category.parent_id })
    return { status: 200 as const, body: { category: row } }
  })
  return NextResponse.json(out.body, { status: out.status })
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!WRITE_ROLES.includes(ctx.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const out = await withTenant(ctx.organizationId, async (db) => {
    const [cat] = await db.select({ id: category.id }).from(category).where(eq(category.id, id)).limit(1)
    if (!cat) return { status: 404 as const, body: { error: "Category not found" } }

    const children = await db.select({ id: category.id }).from(category).where(eq(category.parent_id, id)).limit(1)
    if (children.length > 0) return { status: 409 as const, body: { error: "Delete or move its subcategories first" } }

    // Unassign any products in this category, then delete it.
    await db.update(product).set({ category_id: null }).where(and(eq(product.organization_id, ctx.organizationId), eq(product.category_id, id)))
    await db.delete(category).where(eq(category.id, id))
    return { status: 200 as const, body: { ok: true } }
  })
  return NextResponse.json(out.body, { status: out.status })
}
