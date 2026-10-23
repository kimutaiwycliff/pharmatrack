import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { sql } from "drizzle-orm"
import { withTenant } from "@pharmatrack/db"
import { getTenantContext, requireActiveSubscription } from "@/lib/auth/helpers"
import { requireFeatureApi } from "@/lib/entitlements"
import { zUuid } from "@/lib/api/validation"

const querySchema = z.object({ branch_id: zUuid().optional() })

// GET /api/reports/stock-value — what the stock on the shelves is worth
// (Reports → Inventory, owner only): at cost, at selling price, and the
// profit between them. Unexpired stock only (expired stock can't be sold; its
// cost is reported separately). Cost per unit is the batch's, else the
// product's; stock with no known cost is left out of value and profit and
// counted, so the owner knows what's missing. Sums are exact numeric in SQL.
export async function GET(request: NextRequest) {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const subErr = await requireActiveSubscription(ctx.organizationId)
  if (subErr) return subErr
  if (ctx.role !== "owner") return NextResponse.json({ error: "Only the pharmacy owner can see stock value" }, { status: 403 })
  const locked = await requireFeatureApi(ctx.organizationId, "reports")
  if (locked) return locked

  const parsed = querySchema.safeParse({ branch_id: new URL(request.url).searchParams.get("branch_id") || undefined })
  if (!parsed.success) return NextResponse.json({ error: "Invalid branch" }, { status: 400 })
  const branchId = parsed.data.branch_id ?? null

  const [row] = await withTenant(ctx, (db) => db.execute(sql`
    WITH stock AS (
      SELECT b.product_id, b.quantity_remaining AS qty,
             COALESCE(b.cost_price, p.cost_price) AS unit_cost,
             p.selling_price AS unit_price,
             b.expiry_date < (now() AT TIME ZONE 'Africa/Nairobi')::date AS expired
      FROM product_batch b
      JOIN product p ON p.id = b.product_id
      WHERE b.quantity_remaining > 0
        AND (${branchId}::uuid IS NULL OR b.branch_id = ${branchId}::uuid)
    )
    SELECT
      COALESCE(SUM(qty * unit_cost) FILTER (WHERE NOT expired AND unit_cost IS NOT NULL), 0)::text AS cost_value,
      COALESCE(SUM(qty * unit_price) FILTER (WHERE NOT expired), 0)::text AS retail_value,
      COALESCE(SUM(qty * unit_price) FILTER (WHERE NOT expired AND unit_cost IS NOT NULL), 0)::text AS retail_with_cost,
      COALESCE(SUM(qty * COALESCE(unit_cost, 0)) FILTER (WHERE expired), 0)::text AS expired_cost,
      COALESCE(SUM(qty) FILTER (WHERE NOT expired), 0)::int AS units,
      COUNT(DISTINCT product_id) FILTER (WHERE NOT expired)::int AS products,
      COUNT(DISTINCT product_id) FILTER (WHERE NOT expired AND unit_cost IS NULL)::int AS products_missing_cost,
      COUNT(DISTINCT product_id) FILTER (WHERE expired)::int AS products_expired
    FROM stock
  `)) as unknown as Array<Record<string, string | number>>

  const n = (v: unknown) => Number(v ?? 0)
  const cost = n(row?.cost_value), retail = n(row?.retail_value), retailWithCost = n(row?.retail_with_cost)
  const profit = Math.round((retailWithCost - cost) * 100) / 100
  return NextResponse.json({
    branch_id: branchId,
    cost_value: cost,
    retail_value: retail,
    potential_profit: profit,
    margin_percent: retailWithCost > 0 ? Math.round((profit / retailWithCost) * 1000) / 10 : null,
    expired_cost: n(row?.expired_cost),
    units: n(row?.units),
    products: n(row?.products),
    products_missing_cost: n(row?.products_missing_cost),
    products_expired: n(row?.products_expired),
  }, { headers: { "Cache-Control": "no-store" } })
}
