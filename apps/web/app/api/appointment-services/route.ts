import { NextRequest, NextResponse } from "next/server"
import { getApiContext } from "@/lib/api-auth"
import { z } from "zod"

const createSchema = z.object({
  label: z.string().trim().min(1, "Service name is required").max(80),
  recurrence_weeks: z.number().int().positive().max(260).nullable().optional(),
})

function slugify(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "service"
}

export async function GET(request: NextRequest) {
  const includeInactive = new URL(request.url).searchParams.get("includeInactive") === "true"

  const ctx = await getApiContext()
  if ("error" in ctx) return ctx.error
  const { supabase, profile } = ctx

  let query = supabase
    .from("appointment_services")
    .select("id, slug, label, recurrence_weeks, is_active, sort_order")
    .eq("organization_id", profile.organization_id)
    .order("sort_order")
    .order("label")
  if (!includeInactive) query = query.eq("is_active", true)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ services: data ?? [] })
}

export async function POST(request: NextRequest) {
  const ctx = await getApiContext({ roles: ["owner", "manager"] })
  if ("error" in ctx) return ctx.error
  const { supabase, profile } = ctx

  const parsed = createSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 })
  }
  const { label } = parsed.data
  let slug = slugify(label)

  // Ensure slug is unique within the org (append a suffix if needed).
  const { data: clashes } = await supabase
    .from("appointment_services")
    .select("slug")
    .eq("organization_id", profile.organization_id)
    .like("slug", `${slug}%`)
  const taken = new Set((clashes ?? []).map((c) => c.slug))
  if (taken.has(slug)) {
    let n = 2
    while (taken.has(`${slug}_${n}`)) n++
    slug = `${slug}_${n}`
  }

  const { data: maxRow } = await supabase
    .from("appointment_services")
    .select("sort_order")
    .eq("organization_id", profile.organization_id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle()
  const sort_order = (maxRow?.sort_order ?? -1) + 1

  const { data: service, error } = await supabase
    .from("appointment_services")
    .insert({
      organization_id: profile.organization_id,
      slug,
      label,
      recurrence_weeks: parsed.data.recurrence_weeks ?? null,
      sort_order,
    })
    .select("id, slug, label, recurrence_weeks, is_active, sort_order")
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ service }, { status: 201 })
}
