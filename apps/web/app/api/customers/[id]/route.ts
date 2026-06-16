import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { and, desc, eq, inArray } from "drizzle-orm"
import { withTenant, customer, prescription, prescription_item } from "@pharmatrack/db"
import { getApiContext } from "@/lib/api-auth"

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getApiContext()
  if ("error" in ctx) return ctx.error

  return withTenant(ctx.organizationId, async (db) => {
    const [cust] = await db.select().from(customer).where(eq(customer.id, id)).limit(1)
    if (!cust) return NextResponse.json({ error: "Patient not found" }, { status: 404 })

    const rxRows = await db.select().from(prescription)
      .where(eq(prescription.customer_id, id)).orderBy(desc(prescription.created_at)).limit(50)
    const rxIds = rxRows.map((r) => r.id)
    const items = rxIds.length
      ? await db.select({ prescription_id: prescription_item.prescription_id, drug_name: prescription_item.drug_name, dose: prescription_item.dose, frequency: prescription_item.frequency })
          .from(prescription_item).where(inArray(prescription_item.prescription_id, rxIds))
      : []
    const itemsByRx: Record<string, typeof items> = {}
    for (const it of items) (itemsByRx[it.prescription_id] ??= []).push(it)

    const prescriptions = rxRows.map((r) => ({ ...r, items: itemsByRx[r.id] ?? [] }))
    return NextResponse.json({ customer: cust, prescriptions })
  })
}

const updateSchema = z.object({
  full_name: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  email: z.string().trim().email().max(120).nullable().optional().or(z.literal("")),
  date_of_birth: z.string().nullable().optional(),
  sex: z.enum(["male", "female"]).nullable().optional(),
  allergies: z.string().max(500).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  reminders_opt_in: z.boolean().optional(),
})

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getApiContext({ roles: ["owner", "manager", "pharmacist"] })
  if ("error" in ctx) return ctx.error

  const parsed = updateSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 })

  const d = parsed.data
  const set: Partial<typeof customer.$inferInsert> = { ...d, ...(d.email === "" ? { email: null } : {}) }

  const out = await withTenant(ctx.organizationId, async (db) => {
    const [existing] = await db.select({ id: customer.id }).from(customer).where(eq(customer.id, id)).limit(1)
    if (!existing) return { status: 404 as const, body: { error: "Patient not found" } }
    const [row] = await db.update(customer).set(set).where(eq(customer.id, id)).returning()
    return { status: 200 as const, body: { customer: row } }
  })
  return NextResponse.json(out.body, { status: out.status })
}
