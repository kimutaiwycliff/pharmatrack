import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { and, eq } from "drizzle-orm"
import { withTenant, customer, prescription, prescription_item } from "@pharmatrack/db"
import { zUuid } from "@/lib/api/validation"
import { getApiContext } from "@/lib/api-auth"
import { requireFeatureApi } from "@/lib/entitlements"
import { runDur } from "@/lib/prescriptions/dur"
import { fetchPrescriptions, fetchPrescription } from "@/lib/prescriptions/serialize"

const itemSchema = z.object({
  product_id: zUuid().nullable().optional(),
  drug_name: z.string().trim().min(1),
  dose: z.string().max(80).optional(),
  frequency: z.string().max(80).optional(),
  duration: z.string().max(80).optional(),
  quantity: z.number().int().positive().nullable().optional(),
  instructions: z.string().max(300).optional(),
})

const createSchema = z.object({
  customer_id: zUuid().optional(),
  customer_name: z.string().trim().min(1).max(120).optional(),
  customer_phone: z.string().trim().max(40).optional(),
  prescriber_name: z.string().max(120).optional(),
  prescriber_reg_no: z.string().max(60).optional(),
  diagnosis: z.string().max(300).optional(),
  notes: z.string().max(1000).optional(),
  items: z.array(itemSchema).min(1, "Add at least one drug"),
  confirm: z.boolean().default(false),
})

export async function GET(request: NextRequest) {
  const sp = new URL(request.url).searchParams
  const customerId = sp.get("customer_id"), status = sp.get("status")

  const ctx = await getApiContext()
  if ("error" in ctx) return ctx.error
  const locked = await requireFeatureApi(ctx.organizationId, "prescriptions")
  if (locked) return locked

  const rows = await withTenant(ctx, (db) =>
    fetchPrescriptions(db, and(
      customerId ? eq(prescription.customer_id, customerId) : undefined,
      status && status !== "all" ? eq(prescription.status, status) : undefined,
    )))
  return NextResponse.json({ prescriptions: rows })
}

export async function POST(request: NextRequest) {
  const ctx = await getApiContext({ roles: ["owner", "manager", "pharmacist"] })
  if ("error" in ctx) return ctx.error
  const locked = await requireFeatureApi(ctx.organizationId, "prescriptions")
  if (locked) return locked

  const parsed = createSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 })
  const d = parsed.data

  const out = await withTenant(ctx, async (db) => {
    // Resolve patient (existing id, find by phone, or create).
    let customerId = d.customer_id ?? null
    if (!customerId) {
      if (!d.customer_name) return { status: 400 as const, body: { error: "Patient name is required" } }
      if (d.customer_phone) {
        const [existing] = await db.select({ id: customer.id }).from(customer).where(eq(customer.phone, d.customer_phone)).limit(1)
        customerId = existing?.id ?? null
      }
      if (!customerId) {
        const [created] = await db.insert(customer).values({
          organization_id: ctx.organizationId, full_name: d.customer_name, phone: d.customer_phone || null, created_by: ctx.userId,
        }).returning({ id: customer.id })
        customerId = created!.id
      }
    }

    // Drug Utilization Review — block on severe findings unless confirmed.
    const warnings = await runDur(db, ctx.organizationId, customerId!, d.items.map((i) => i.drug_name))
    const severe = warnings.filter((w) => w.severity === "severe")
    if (severe.length > 0 && !d.confirm) {
      return { status: 409 as const, body: { error: "Review safety warnings", warnings, requiresConfirmation: true } }
    }

    const [rx] = await db.insert(prescription).values({
      organization_id: ctx.organizationId, customer_id: customerId!,
      prescriber_name: d.prescriber_name || null, prescriber_reg_no: d.prescriber_reg_no || null,
      diagnosis: d.diagnosis || null, notes: d.notes || null, created_by: ctx.userId,
    }).returning({ id: prescription.id })

    await db.insert(prescription_item).values(d.items.map((i) => ({
      prescription_id: rx!.id, product_id: i.product_id ?? null, drug_name: i.drug_name,
      dose: i.dose || null, frequency: i.frequency || null, duration: i.duration || null,
      quantity: i.quantity ?? null, instructions: i.instructions || null,
    })))

    const full = await fetchPrescription(db, rx!.id)
    return { status: 201 as const, body: { prescription: full, warnings } }
  })
  return NextResponse.json(out.body, { status: out.status })
}
