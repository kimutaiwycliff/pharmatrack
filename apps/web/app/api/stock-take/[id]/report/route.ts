import { NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { withTenant, stock_count } from "@pharmatrack/db"
import { toCSV } from "@pharmatrack/core"
import { zUuid } from "@/lib/api/validation"
import { canViewCost } from "@/lib/auth/costVisibility"
import { stockTakeContext } from "@/lib/stockTake/server"
import { planSession } from "@/lib/stockTake/post"

// CSV of a stock take: every counted line with its difference (ADR-020).
// Recorded quantities are shown once the session has left counting, so a
// hidden-quantity count can't be read back mid-way.

type Params = { params: Promise<{ id: string }> }

const KIND: Record<string, string> = { batch: "Counted", new_batch: "New batch found", new_product: "New product" }

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params
  if (!zUuid().safeParse(id).success) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const r = await stockTakeContext()
  if ("error" in r) return r.error
  const { ctx } = r
  const showCost = canViewCost(ctx)

  const out = await withTenant(ctx, async (db) => {
    const [session] = await db.select().from(stock_count).where(eq(stock_count.id, id)).limit(1)
    if (!session) return null
    const plan = await planSession(db, session)
    const hide = session.hide_expected && session.status === "draft"
    const headers = ["Product", "Line", "Batch", "Expiry", "Recorded", "Counted", "Difference", ...(showCost ? ["Value at cost (KES)"] : []), "Controlled"]
    const rows = plan.rows.map((x) => [
      x.name, KIND[x.kind] ?? x.kind, x.batch?.batch_number ?? x.line.batch_number ?? "", x.batch?.expiry_date ?? (x.line.expiry_date ? String(x.line.expiry_date) : ""),
      hide || x.expected == null ? "" : x.expected, x.line.counted_qty, hide ? "" : x.delta,
      ...(showCost ? [x.unitCost == null || hide ? "" : (Math.round(x.delta * x.unitCost * 100) / 100).toFixed(2)] : []),
      x.controlled ? "Yes" : "",
    ])
    return { csv: toCSV(headers, rows), title: session.title }
  })
  if (!out) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const file = `stock-take-${out.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.csv`
  return new NextResponse(out.csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${file}"` } })
}
