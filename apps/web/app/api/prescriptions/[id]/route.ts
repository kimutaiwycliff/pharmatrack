import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getApiContext } from "@/lib/api-auth"

const updateSchema = z.object({
  status: z.enum(["active", "completed", "cancelled"]),
})

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getApiContext({ roles: ["owner", "manager", "pharmacist"] })
  if ("error" in ctx) return ctx.error
  const { supabase, profile } = ctx

  const parsed = updateSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 })

  const { data: existing } = await supabase
    .from("prescriptions").select("id, organization_id").eq("id", id).single()
  if (!existing || existing.organization_id !== profile.organization_id) {
    return NextResponse.json({ error: "Prescription not found" }, { status: 404 })
  }

  const { data: rx, error } = await supabase
    .from("prescriptions")
    .update({ status: parsed.data.status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, status")
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ prescription: rx })
}
