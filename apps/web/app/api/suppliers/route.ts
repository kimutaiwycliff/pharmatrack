import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { asc, ilike } from "drizzle-orm"
import { withTenant, supplier } from "@pharmatrack/db"
import { getTenantContext, type Role } from "@/lib/auth/helpers"
import { serializeSupplier } from "@/lib/suppliers/serialize"

const createSchema = z.object({
  name: z.string().trim().min(1, "Supplier name is required").max(120),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().email("Invalid email").max(120).optional().or(z.literal("")),
  address: z.string().trim().max(200).optional(),
})

// Creating suppliers is allowed during product/stock entry, so pharmacists qualify too.
const WRITE_ROLES: Role[] = ["owner", "manager", "pharmacist"]

export async function GET(_request: NextRequest) {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const rows = await withTenant(ctx, (db) =>
    db.select().from(supplier).orderBy(asc(supplier.name)))
  return NextResponse.json({ suppliers: rows.map(serializeSupplier) })
}

export async function POST(request: NextRequest) {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!WRITE_ROLES.includes(ctx.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const parsed = createSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 })
  const { name, phone, email } = parsed.data

  const out = await withTenant(ctx, async (db) => {
    // Friendly duplicate guard within the org (case-insensitive).
    const [dup] = await db.select({ id: supplier.id }).from(supplier).where(ilike(supplier.name, name)).limit(1)
    if (dup) return { status: 409 as const, body: { error: `"${name}" already exists` } }

    const [row] = await db.insert(supplier).values({
      organization_id: ctx.organizationId, name, phone: phone || null, email: email || null,
    }).returning()
    return { status: 201 as const, body: { supplier: serializeSupplier(row!) } }
  })
  return NextResponse.json(out.body, { status: out.status })
}
