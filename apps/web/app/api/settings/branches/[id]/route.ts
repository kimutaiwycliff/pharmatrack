import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { eq } from "drizzle-orm"
import { withTenant, branch } from "@pharmatrack/db"
import { getTenantContext, type Role } from "@/lib/auth/helpers"

const updateSchema = z.object({
  name: z.string().min(2).optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  is_active: z.boolean().optional(),
})

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!(["owner", "manager"] as Role[]).includes(ctx.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const parsed = updateSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 })

  const out = await withTenant(ctx, async (db) => {
    const [existing] = await db.select({ id: branch.id }).from(branch).where(eq(branch.id, id)).limit(1)
    if (!existing) return { status: 404 as const, body: { error: "Branch not found" } }
    const [updated] = await db.update(branch).set(parsed.data).where(eq(branch.id, id)).returning()
    return { status: 200 as const, body: { branch: updated } }
  })
  return NextResponse.json(out.body, { status: out.status })
}
