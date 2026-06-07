import { NextRequest, NextResponse } from "next/server"
import { getApiContext } from "@/lib/api-auth"

// Lightweight search for the booking autocomplete (by name or phone).
export async function GET(request: NextRequest) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? ""

  const ctx = await getApiContext()
  if ("error" in ctx) return ctx.error
  const { supabase, profile } = ctx

  let query = supabase
    .from("customers")
    .select("id, full_name, phone, email, reminders_opt_in")
    .eq("organization_id", profile.organization_id)
    .order("full_name")
    .limit(10)

  if (q) query = query.or(`full_name.ilike.%${q}%,phone.ilike.%${q}%`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ customers: data ?? [] })
}
