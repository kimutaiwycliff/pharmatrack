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

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const branchId = searchParams.get("branch_id")
  const from = searchParams.get("from")
  const to = searchParams.get("to")
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"))
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "20")))

  if (!branchId) return NextResponse.json({ error: "branch_id required" }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 })

  let query = supabase
    .from("shifts")
    .select("*, profiles!inner(full_name, role)", { count: "exact" })
    .eq("branch_id", branchId)
    .order("clocked_in_at", { ascending: false })

  if (profile.role === "cashier") query = query.eq("staff_id", user.id)
  if (from) query = query.gte("clocked_in_at", from)
  if (to) query = query.lte("clocked_in_at", to)

  const offset = (page - 1) * limit
  query = query.range(offset, offset + limit - 1)

  const { data: shifts, count, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const shiftIds = (shifts ?? []).map((s) => s.id)
  const salesByShift: Record<string, { count: number; total: number; cash: number; mpesa: number }> = {}

  if (shiftIds.length > 0) {
    const { data: sales } = await supabase
      .from("sales")
      .select("shift_id, total_amount, payment_method")
      .in("shift_id", shiftIds)
      .eq("status", "completed")

    for (const s of sales ?? []) {
      if (!s.shift_id) continue
      const e = salesByShift[s.shift_id] ?? { count: 0, total: 0, cash: 0, mpesa: 0 }
      e.count += 1
      e.total += Number(s.total_amount)
      if (s.payment_method === "cash") e.cash += Number(s.total_amount)
      if (s.payment_method === "mpesa") e.mpesa += Number(s.total_amount)
      salesByShift[s.shift_id] = e
    }
  }

  const rows = (shifts ?? []).map((s) => {
    const t = salesByShift[s.id] ?? { count: 0, total: 0, cash: 0, mpesa: 0 }
    const variance =
      s.closing_cash != null
        ? Number(s.closing_cash) - (Number(s.opening_float) + t.cash)
        : null
    return { ...s, sale_count: t.count, total_sales: t.total, cash_sales: t.cash, mpesa_sales: t.mpesa, variance }
  })

  return NextResponse.json({ shifts: rows, total: count ?? 0, page, limit })
}

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
