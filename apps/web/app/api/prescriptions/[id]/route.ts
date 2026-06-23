import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { eq } from "drizzle-orm"
import { withTenant, prescription } from "@pharmatrack/db"
import { getApiContext } from "@/lib/api-auth"

const updateSchema = z.object({
  status: z.enum(["active", "completed", "cancelled"]),
})

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getApiContext({ roles: ["owner", "manager", "pharmacist"] })
  if ("error" in ctx) return ctx.error

  const parsed = updateSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 })

  const out = await withTenant(ctx, async (db) => {
    const [existing] = await db.select({ id: prescription.id }).from(prescription).where(eq(prescription.id, id)).limit(1)
    if (!existing) return { status: 404 as const, body: { error: "Prescription not found" } }
    const [rx] = await db.update(prescription).set({ status: parsed.data.status }).where(eq(prescription.id, id)).returning({ id: prescription.id, status: prescription.status })
    return { status: 200 as const, body: { prescription: rx } }
  })
  return NextResponse.json(out.body, { status: out.status })
}
