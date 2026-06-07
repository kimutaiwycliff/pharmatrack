import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// Lightweight search for the booking autocomplete (by name or phone).
export async function GET(request: NextRequest) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? ""

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single()
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 })

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
