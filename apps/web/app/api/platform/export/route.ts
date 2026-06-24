import { NextRequest, NextResponse } from "next/server"
import { and, desc, eq, gte, lte, sql } from "drizzle-orm"
import { organization, sale, sale_item, product, subscription, plan, category } from "@pharmatrack/db"
import { getPlatformContext } from "@/lib/platform"

// Platform-operator-only cross-tenant data harvest for analytics / ML. Uses the
// privileged client (RLS-bypassing) — gated strictly behind platform admin.
// GET /api/platform/export?dataset=sales|products|stats&format=csv|json[&from&to]

const MAX_ROWS = 100_000

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return ""
  const cols = Object.keys(rows[0]!)
  const esc = (v: unknown) => {
    if (v == null) return ""
    const s = v instanceof Date ? v.toISOString() : String(v)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n")
}

export async function GET(request: NextRequest) {
  const ctx = await getPlatformContext()
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { db } = ctx

  const sp = new URL(request.url).searchParams
  const dataset = sp.get("dataset") ?? "sales"
  const format = sp.get("format") ?? "csv"
  const from = sp.get("from")
  const to = sp.get("to")

  let rows: Record<string, unknown>[]

  if (dataset === "sales") {
    // One row per sale line item — the grain you want for analytics/ML.
    rows = await db
      .select({
        org_id: sale.organization_id,
        org_name: organization.name,
        branch_id: sale.branch_id,
        sale_id: sale.id,
        created_at: sale.created_at,
        status: sale.status,
        payment_method: sale.payment_method,
        sale_total: sale.total_amount,
        product_id: sale_item.product_id,
        product_name: sale_item.product_name,
        quantity: sale_item.quantity,
        unit_price: sale_item.unit_price,
        discount_percent: sale_item.discount_percent,
        line_total: sale_item.line_total,
      })
      .from(sale_item)
      .innerJoin(sale, eq(sale.id, sale_item.sale_id))
      .leftJoin(organization, eq(organization.id, sale.organization_id))
      .where(and(
        from ? gte(sale.created_at, new Date(from)) : undefined,
        to ? lte(sale.created_at, new Date(to)) : undefined,
      ))
      .orderBy(desc(sale.created_at))
      .limit(MAX_ROWS)
  } else if (dataset === "products") {
    rows = await db
      .select({
        org_id: product.organization_id,
        org_name: organization.name,
        product_id: product.id,
        name: product.name,
        brand_name: product.brand_name,
        strength: product.strength,
        dosage_form: product.dosage_form,
        category: category.name,
        selling_price: product.selling_price,
        cost_price: product.cost_price,
        is_controlled: product.is_controlled,
        requires_prescription: product.requires_prescription,
        is_active: product.is_active,
        gtin: product.gtin,
      })
      .from(product)
      .leftJoin(organization, eq(organization.id, product.organization_id))
      .leftJoin(category, eq(category.id, product.category_id))
      .limit(MAX_ROWS)
  } else if (dataset === "stats") {
    // One row per tenant — headline metrics for a portfolio view / ML features.
    rows = await db
      .select({
        org_id: organization.id,
        org_name: organization.name,
        joined_at: organization.createdAt,
        plan: plan.name,
        status: subscription.status,
        branches: sql<number>`(select count(*)::int from branch b where b.organization_id = ${organization.id})`,
        staff: sql<number>`(select count(*)::int from staff_profile s where s.organization_id = ${organization.id})`,
        products: sql<number>`(select count(*)::int from product p where p.organization_id = ${organization.id})`,
        sales_count: sql<number>`(select count(*)::int from sale s where s.organization_id = ${organization.id} and s.status = 'completed')`,
        revenue: sql<string>`(select coalesce(sum(s.total_amount),0)::text from sale s where s.organization_id = ${organization.id} and s.status = 'completed')`,
        last_sale_at: sql<string>`(select max(s.created_at) from sale s where s.organization_id = ${organization.id})`,
      })
      .from(organization)
      .leftJoin(subscription, eq(subscription.organization_id, organization.id))
      .leftJoin(plan, eq(plan.id, subscription.plan_id))
      .orderBy(organization.name)
  } else {
    return NextResponse.json({ error: "Unknown dataset (use sales | products | stats)" }, { status: 400 })
  }

  if (format === "json") {
    return NextResponse.json({ dataset, count: rows.length, rows })
  }

  const csv = toCsv(rows)
  const date = new Date().toISOString().slice(0, 10)
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="pharmatrack-${dataset}-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  })
}
