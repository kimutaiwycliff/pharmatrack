import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { withTenant, sale, sale_item, payment, organization, branch, user, org_settings } from "@pharmatrack/db"
import { getTenantContext } from "@/lib/auth/helpers"
import { apiError } from "@/lib/api/errors"

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getTenantContext()
  if (!ctx) return apiError("Unauthorized", 401)

  return withTenant(ctx, async (db) => {
    const [found] = await db.select({
      row: sale, org_name: organization.name, branch_name: branch.name, branch_address: branch.address, cashier_name: user.name,
    }).from(sale)
      .leftJoin(organization, eq(organization.id, sale.organization_id))
      .leftJoin(branch, eq(branch.id, sale.branch_id))
      .leftJoin(user, eq(user.id, sale.cashier_id))
      .where(eq(sale.id, id)).limit(1)

    if (!found) return apiError("Sale not found", 404)
    // Cashiers may only reprint their own sales — treat someone else's as not found
    // rather than 403, so their existence isn't leaked.
    if (ctx.role === "cashier" && found.row.cashier_id !== ctx.userId) return apiError("Sale not found", 404)

    const items = await db.select().from(sale_item).where(eq(sale_item.sale_id, id))
    const [paymentRow] = await db.select().from(payment).where(eq(payment.sale_id, id)).limit(1)
    const [settingsRow] = await db.select({ settings: org_settings.settings }).from(org_settings)
      .where(eq(org_settings.organization_id, found.row.organization_id)).limit(1)
    const paperWidth = (settingsRow?.settings as { receipt_paper_width?: string } | undefined)?.receipt_paper_width ?? "80mm"

    return NextResponse.json({
      paperWidth,
      sale: {
        ...found.row,
        subtotal: Number(found.row.subtotal), discount_amount: Number(found.row.discount_amount),
        tax_amount: Number(found.row.tax_amount), total_amount: Number(found.row.total_amount),
        amount_tendered: found.row.amount_tendered != null ? Number(found.row.amount_tendered) : null,
        change_given: found.row.change_given != null ? Number(found.row.change_given) : null,
        mpesa_reference: paymentRow?.mpesa_receipt ?? null,
        org_name: found.org_name, branch_name: found.branch_name, branch_address: found.branch_address, cashier_name: found.cashier_name ?? "—",
      },
      items: items.map((row) => ({
        ...row,
        unit_price: Number(row.unit_price), line_total: Number(row.line_total), discount_percent: Number(row.discount_percent),
      })),
    })
  })
}
