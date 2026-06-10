import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getApiContext } from "@/lib/api-auth"

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getApiContext()
  if ("error" in ctx) return ctx.error
  const { supabase, profile } = ctx

  const { data: customer, error } = await supabase
    .from("customers")
    .select("*")
    .eq("id", id)
    .eq("organization_id", profile.organization_id)
    .single()
  if (error || !customer) return NextResponse.json({ error: "Patient not found" }, { status: 404 })

  const { data: prescriptions } = await supabase
    .from("prescriptions")
    .select("*, items:prescription_items(drug_name, dose, frequency)")
    .eq("organization_id", profile.organization_id)
    .eq("customer_id", id)
    .order("created_at", { ascending: false })
    .limit(50)

  return NextResponse.json({ customer, prescriptions: prescriptions ?? [] })
}

const updateSchema = z.object({
  full_name: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  email: z.string().trim().email().max(120).nullable().optional().or(z.literal("")),
  date_of_birth: z.string().nullable().optional(), // YYYY-MM-DD
  sex: z.enum(["male", "female"]).nullable().optional(),
  allergies: z.string().max(500).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  reminders_opt_in: z.boolean().optional(),
})

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getApiContext({ roles: ["owner", "manager", "pharmacist"] })
  if ("error" in ctx) return ctx.error
  const { supabase, profile } = ctx

  const parsed = updateSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 })

  const { data: existing } = await supabase
    .from("customers").select("id, organization_id").eq("id", id).single()
  if (!existing || existing.organization_id !== profile.organization_id) {
    return NextResponse.json({ error: "Patient not found" }, { status: 404 })
  }

  const d = parsed.data
  const patch = { ...d, ...(d.email === "" ? { email: null } : {}) }

  const { data: customer, error } = await supabase
    .from("customers").update(patch).eq("id", id).select("*").single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ customer })
}
