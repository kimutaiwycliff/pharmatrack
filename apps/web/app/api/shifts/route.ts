import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { z } from "zod"

const clockInSchema = z.object({
  opening_float: z.number().nonnegative(),
})

const clockOutSchema = z.object({
  shift_id: z.string().uuid(),
  closing_cash: z.number().nonnegative(),
})

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = (await req.json()) as unknown
  const parsed = clockInSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("branch_id")
    .eq("id", user.id)
    .single()

  if (!profile?.branch_id) {
    return NextResponse.json({ error: "No branch assigned to this account" }, { status: 400 })
  }

  const { data: shift, error } = await supabase
    .from("shifts")
    .insert({
      staff_id: user.id,
      branch_id: profile.branch_id,
      clocked_in_at: new Date().toISOString(),
      opening_float: parsed.data.opening_float,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ shift }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = (await req.json()) as unknown
  const parsed = clockOutSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }

  // Verify the shift belongs to this user
  const { data: existing } = await supabase
    .from("shifts")
    .select("id, staff_id")
    .eq("id", parsed.data.shift_id)
    .is("clocked_out_at", null)
    .single()

  if (!existing || existing.staff_id !== user.id) {
    return NextResponse.json({ error: "Shift not found or already closed" }, { status: 404 })
  }

  const { data: shift, error } = await supabase
    .from("shifts")
    .update({
      clocked_out_at: new Date().toISOString(),
      closing_cash: parsed.data.closing_cash,
    })
    .eq("id", parsed.data.shift_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ shift })
}
