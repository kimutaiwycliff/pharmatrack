import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { withTenant, branch } from "@pharmatrack/db"
import { getTenantContext } from "@/lib/auth/helpers"

const branchSchema = z.object({
  name: z.string().min(2),
  address: z.string().optional(),
  phone: z.string().optional(),
})

export async function POST(request: NextRequest) {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (ctx.role !== "owner") return NextResponse.json({ error: "Only owners can create branches" }, { status: 403 })

  const parsed = branchSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 })

  const [row] = await withTenant(ctx, (db) =>
    db.insert(branch).values({
      organization_id: ctx.organizationId, name: parsed.data.name,
      address: parsed.data.address ?? null, phone: parsed.data.phone ?? null,
    }).returning())
  return NextResponse.json({ branch: row }, { status: 201 })
}
