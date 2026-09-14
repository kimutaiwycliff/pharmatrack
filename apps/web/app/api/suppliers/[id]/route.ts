import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { eq } from "drizzle-orm"
import { withTenant, supplier } from "@pharmatrack/db"
import { getTenantContext, type Role, requireActiveSubscription } from "@/lib/auth/helpers"
import { serializeSupplier } from "@/lib/suppliers/serialize"

const updateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  email: z.string().trim().email("Invalid email").max(120).nullable().optional().or(z.literal("")),
  address: z.string().trim().max(200).nullable().optional(),
  is_active: z.boolean().optional(),
})

// Editing suppliers is a management action (owner/manager).
const WRITE_ROLES: Role[] = ["owner", "manager"]

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const subErr = await requireActiveSubscription(ctx.organizationId)
  if (subErr) return subErr
  if (!WRITE_ROLES.includes(ctx.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const parsed = updateSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 })

  // address + is_active no longer persist (schema dropped them); only name/phone/email remain.
  const d = parsed.data
  const set: Partial<typeof supplier.$inferInsert> = {}
  if (d.name !== undefined) set.name = d.name
  if (d.phone !== undefined) set.phone = d.phone === "" ? null : d.phone
  if (d.email !== undefined) set.email = d.email === "" ? null : d.email

  const out = await withTenant(ctx, async (db) => {
    const [existing] = await db.select({ id: supplier.id }).from(supplier).where(eq(supplier.id, id)).limit(1)
    if (!existing) return { status: 404 as const, body: { error: "Supplier not found" } }
    const row = Object.keys(set).length > 0
      ? (await db.update(supplier).set(set).where(eq(supplier.id, id)).returning())[0]!
      : (await db.select().from(supplier).where(eq(supplier.id, id)).limit(1))[0]!
    return { status: 200 as const, body: { supplier: serializeSupplier(row) } }
  })
  return NextResponse.json(out.body, { status: out.status })
}
