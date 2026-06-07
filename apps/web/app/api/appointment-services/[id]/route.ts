import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { z } from "zod"

const WRITE_ROLES = ["owner", "manager"]

const updateSchema = z.object({
  label: z.string().trim().min(1).max(80).optional(),
  recurrence_weeks: z.number().int().positive().max(260).nullable().optional(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().optional(),
})

async function getContext() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  const { data: profile } = await supabase.from("profiles").select("organization_id, role").eq("id", user.id).single()
  if (!profile) return { error: NextResponse.json({ error: "Profile not found" }, { status: 404 }) }
  if (!WRITE_ROLES.includes(profile.role)) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  return { supabase, profile }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getContext()
  if (ctx.error) return ctx.error
  const { supabase, profile } = ctx

  const parsed = updateSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 })

  const { data: existing } = await supabase
    .from("appointment_services").select("id, organization_id").eq("id", id).single()
  if (!existing || existing.organization_id !== profile.organization_id) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 })
  }

  const { data: service, error } = await supabase
    .from("appointment_services")
    .update(parsed.data)
    .eq("id", id)
    .select("id, slug, label, recurrence_weeks, is_active, sort_order")
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ service })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getContext()
  if (ctx.error) return ctx.error
  const { supabase, profile } = ctx

  const { data: existing } = await supabase
    .from("appointment_services").select("id, organization_id, slug").eq("id", id).single()
  if (!existing || existing.organization_id !== profile.organization_id) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 })
  }

  // Keep history intact: if any appointment uses this service, deactivate instead of deleting.
  const { count } = await supabase
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", profile.organization_id)
    .eq("service", existing.slug)
  if (count && count > 0) {
    await supabase.from("appointment_services").update({ is_active: false }).eq("id", id)
    return NextResponse.json({ ok: true, deactivated: true })
  }

  const { error } = await supabase.from("appointment_services").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
