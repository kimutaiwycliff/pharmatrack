import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { zUuid } from "@/lib/api/validation"
import { getApiContext } from "@/lib/api-auth"
import { runDur } from "@/lib/prescriptions/dur"

const SELECT =
  "*, customer:customers(id, full_name, phone, allergies), items:prescription_items(*)"

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
  confirm: z.boolean().default(false), // override severe DUR warnings
})

export async function GET(request: NextRequest) {
  const sp = new URL(request.url).searchParams
  const customerId = sp.get("customer_id")
  const status = sp.get("status")

  const ctx = await getApiContext()
  if ("error" in ctx) return ctx.error
  const { supabase, profile } = ctx

  let query = supabase
    .from("prescriptions")
    .select(SELECT)
    .eq("organization_id", profile.organization_id)
    .order("created_at", { ascending: false })
    .limit(100)
  if (customerId) query = query.eq("customer_id", customerId)
  if (status && status !== "all") query = query.eq("status", status)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ prescriptions: data ?? [] })
}

export async function POST(request: NextRequest) {
  const ctx = await getApiContext({ roles: ["owner", "manager", "pharmacist"] })
  if ("error" in ctx) return ctx.error
  const { supabase, user, profile } = ctx
  const orgId = profile.organization_id

  const parsed = createSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 })
  }
  const d = parsed.data

  // Resolve patient (existing id, find by phone, or create).
  let customerId = d.customer_id ?? null
  if (!customerId) {
    if (!d.customer_name) return NextResponse.json({ error: "Patient name is required" }, { status: 400 })
    if (d.customer_phone) {
      const { data: existing } = await supabase
        .from("customers").select("id").eq("organization_id", orgId).eq("phone", d.customer_phone).maybeSingle()
      customerId = existing?.id ?? null
    }
    if (!customerId) {
      const { data: created, error: cErr } = await supabase
        .from("customers")
        .insert({ organization_id: orgId, full_name: d.customer_name, phone: d.customer_phone || null, created_by: user.id })
        .select("id").single()
      if (cErr || !created) return NextResponse.json({ error: cErr?.message ?? "Failed to create patient" }, { status: 500 })
      customerId = created.id
    }
  }

  // Drug Utilization Review — block on severe findings unless confirmed.
  const warnings = await runDur(supabase, orgId, customerId, d.items.map((i) => i.drug_name))
  const severe = warnings.filter((w) => w.severity === "severe")
  if (severe.length > 0 && !d.confirm) {
    return NextResponse.json({ error: "Review safety warnings", warnings, requiresConfirmation: true }, { status: 409 })
  }

  const { data: rx, error } = await supabase
    .from("prescriptions")
    .insert({
      organization_id: orgId,
      customer_id: customerId,
      prescriber_name: d.prescriber_name || null,
      prescriber_reg_no: d.prescriber_reg_no || null,
      diagnosis: d.diagnosis || null,
      notes: d.notes || null,
      created_by: user.id,
    })
    .select("id").single()
  if (error || !rx) return NextResponse.json({ error: error?.message ?? "Failed to create prescription" }, { status: 500 })

  const { error: itemsErr } = await supabase.from("prescription_items").insert(
    d.items.map((i) => ({
      prescription_id: rx.id,
      product_id: i.product_id ?? null,
      drug_name: i.drug_name,
      dose: i.dose || null,
      frequency: i.frequency || null,
      duration: i.duration || null,
      quantity: i.quantity ?? null,
      instructions: i.instructions || null,
    })),
  )
  if (itemsErr) {
    await supabase.from("prescriptions").delete().eq("id", rx.id)
    return NextResponse.json({ error: itemsErr.message }, { status: 500 })
  }

  const { data: full } = await supabase.from("prescriptions").select(SELECT).eq("id", rx.id).single()
  return NextResponse.json({ prescription: full, warnings }, { status: 201 })
}
