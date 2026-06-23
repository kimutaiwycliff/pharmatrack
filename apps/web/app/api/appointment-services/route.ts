import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { and, asc, desc, eq, like } from "drizzle-orm"
import { withTenant, appointment_service } from "@pharmatrack/db"
import { getApiContext } from "@/lib/api-auth"

const createSchema = z.object({
  label: z.string().trim().min(1, "Service name is required").max(80),
  recurrence_weeks: z.number().int().positive().max(260).nullable().optional(),
})

function slugify(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "service"
}

const cols = {
  id: appointment_service.id, slug: appointment_service.slug, label: appointment_service.label,
  recurrence_weeks: appointment_service.recurrence_weeks, is_active: appointment_service.is_active, sort_order: appointment_service.sort_order,
}

export async function GET(request: NextRequest) {
  const includeInactive = new URL(request.url).searchParams.get("includeInactive") === "true"
  const ctx = await getApiContext()
  if ("error" in ctx) return ctx.error

  const rows = await withTenant(ctx, (db) =>
    db.select(cols).from(appointment_service)
      .where(includeInactive ? undefined : eq(appointment_service.is_active, true))
      .orderBy(asc(appointment_service.sort_order), asc(appointment_service.label)))
  return NextResponse.json({ services: rows })
}

export async function POST(request: NextRequest) {
  const ctx = await getApiContext({ roles: ["owner", "manager"] })
  if ("error" in ctx) return ctx.error

  const parsed = createSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 })
  const { label } = parsed.data

  const out = await withTenant(ctx, async (db) => {
    let slug = slugify(label)
    // Ensure slug is unique within the org (append a suffix if needed).
    const clashes = await db.select({ slug: appointment_service.slug }).from(appointment_service).where(like(appointment_service.slug, `${slug}%`))
    const taken = new Set(clashes.map((c) => c.slug))
    if (taken.has(slug)) { let n = 2; while (taken.has(`${slug}_${n}`)) n++; slug = `${slug}_${n}` }

    const [maxRow] = await db.select({ sort_order: appointment_service.sort_order }).from(appointment_service).orderBy(desc(appointment_service.sort_order)).limit(1)
    const sort_order = (maxRow?.sort_order ?? -1) + 1

    const [service] = await db.insert(appointment_service).values({
      organization_id: ctx.organizationId, slug, label, recurrence_weeks: parsed.data.recurrence_weeks ?? null, sort_order,
    }).returning(cols)
    return { service }
  })
  return NextResponse.json(out, { status: 201 })
}
