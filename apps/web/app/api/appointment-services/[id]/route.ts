import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { and, eq } from "drizzle-orm"
import { withTenant, appointment_service, appointment } from "@pharmatrack/db"
import { getApiContext } from "@/lib/api-auth"

const updateSchema = z.object({
  label: z.string().trim().min(1).max(80).optional(),
  recurrence_weeks: z.number().int().positive().max(260).nullable().optional(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().optional(),
})

const cols = {
  id: appointment_service.id, slug: appointment_service.slug, label: appointment_service.label,
  recurrence_weeks: appointment_service.recurrence_weeks, is_active: appointment_service.is_active, sort_order: appointment_service.sort_order,
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getApiContext({ roles: ["owner", "manager"] })
  if ("error" in ctx) return ctx.error

  const parsed = updateSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 })

  const out = await withTenant(ctx, async (db) => {
    const [existing] = await db.select({ id: appointment_service.id }).from(appointment_service).where(eq(appointment_service.id, id)).limit(1)
    if (!existing) return { status: 404 as const, body: { error: "Service not found" } }
    const [service] = await db.update(appointment_service).set(parsed.data).where(eq(appointment_service.id, id)).returning(cols)
    return { status: 200 as const, body: { service } }
  })
  return NextResponse.json(out.body, { status: out.status })
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getApiContext({ roles: ["owner", "manager"] })
  if ("error" in ctx) return ctx.error

  const out = await withTenant(ctx, async (db) => {
    const [existing] = await db.select({ id: appointment_service.id, slug: appointment_service.slug }).from(appointment_service).where(eq(appointment_service.id, id)).limit(1)
    if (!existing) return { status: 404 as const, body: { error: "Service not found" } }

    // Keep history intact: if any appointment uses this service, deactivate instead of deleting.
    const used = await db.select({ id: appointment.id }).from(appointment).where(eq(appointment.service, existing.slug)).limit(1)
    if (used.length > 0) {
      await db.update(appointment_service).set({ is_active: false }).where(eq(appointment_service.id, id))
      return { status: 200 as const, body: { ok: true, deactivated: true } }
    }
    await db.delete(appointment_service).where(eq(appointment_service.id, id))
    return { status: 200 as const, body: { ok: true } }
  })
  return NextResponse.json(out.body, { status: out.status })
}
