import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: shift, error } = await supabase
    .from("shifts")
    .select("*, profiles!inner(full_name, role)")
    .eq("id", id)
    .single()

  if (error || !shift) return NextResponse.json({ error: "Shift not found" }, { status: 404 })

  const { data: sales } = await supabase
    .from("sales")
    .select("total_amount, payment_method, status, created_at")
    .eq("shift_id", id)
    .eq("status", "completed")

  const totals = (sales ?? []).reduce(
    (acc, s) => {
      acc.count += 1
      acc.total += Number(s.total_amount)
      if (s.payment_method === "cash") acc.cash += Number(s.total_amount)
      if (s.payment_method === "mpesa") acc.mpesa += Number(s.total_amount)
      if (s.payment_method === "split") acc.split += Number(s.total_amount)
      return acc
    },
    { count: 0, total: 0, cash: 0, mpesa: 0, split: 0 },
  )

  const variance =
    shift.closing_cash != null
      ? Number(shift.closing_cash) - (Number(shift.opening_float) + totals.cash)
      : null

  return NextResponse.json({
    shift: {
      ...shift,
      sale_count: totals.count,
      total_sales: totals.total,
      cash_sales: totals.cash,
      mpesa_sales: totals.mpesa,
      split_sales: totals.split,
      variance,
    },
  })
}
