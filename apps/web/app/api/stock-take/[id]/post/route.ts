import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { eq, inArray } from "drizzle-orm"
import { withTenant, product, stock_count } from "@pharmatrack/db"
import type { Capability } from "@pharmatrack/core"
import { zUuid } from "@/lib/api/validation"
import { zodErrorResponse } from "@/lib/api/errors"
import { canViewCost } from "@/lib/auth/costVisibility"
import { invalidateBarcodeCache } from "@/lib/products/barcodeCache"
import { stockTakeContext } from "@/lib/stockTake/server"
import { planSession, postSession } from "@/lib/stockTake/post"

// Review and post a stock take (ADR-020). "preview" returns the differences
// for the review screen; "post" applies them — or, when a difference is big
// or on a controlled drug and the person can't adjust stock, sends the
// session for approval instead.

type Params = { params: Promise<{ id: string }> }
const bodySchema = z.object({ action: z.enum(["preview", "post"]) })

const denied = (capability: Capability) => ({
  status: 403,
  body: { error: "You don't have permission to do this. Ask the pharmacy owner to enable it in Settings → Roles & permissions.", code: "permission_denied", capability },
})

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params
  if (!zUuid().safeParse(id).success) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const r = await stockTakeContext()
  if ("error" in r) return r.error
  const { ctx } = r
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return zodErrorResponse(parsed.error)
  const showCost = canViewCost(ctx)
  const can = (c: Capability) => ctx.permissions.includes(c)

  const out: { status: number; body: unknown; codes?: Array<string | null> } = await withTenant(ctx, async (db) => {
    const [session] = await db.select().from(stock_count).where(eq(stock_count.id, id)).for("update").limit(1)
    if (!session) return { status: 404, body: { error: "Not found" } }
    if (session.status === "posted") return { status: 200, body: { status: "posted", totals: session.totals } }
    if (session.status === "cancelled") return { status: 409, body: { error: "This stock take was cancelled." } }

    const plan = await planSession(db, session)
    if (parsed.data.action === "preview") {
      return {
        status: 200, body: {
          summary: { ...plan.summary, valueFound: showCost ? plan.summary.valueFound : null, valueMissing: showCost ? plan.summary.valueMissing : null },
          pricesSet: plan.pricesSet, skipped: plan.skipped,
          rows: plan.rows.map((x) => ({
            id: x.line.id, kind: x.kind, name: x.name, controlled: x.controlled,
            batch_number: x.batch?.batch_number ?? x.line.batch_number, expiry: x.batch?.expiry_date ?? (x.line.expiry_date ? String(x.line.expiry_date) : null),
            expected: x.expected, counted: x.line.counted_qty, delta: x.delta,
            value: showCost && x.unitCost != null ? Math.round(Math.abs(x.delta) * x.unitCost * 100) / 100 : null,
            price: x.line.price_confirmed ? Number(x.line.selling_price) : null,
          })),
          needsApproval: plan.summary.approvalReasons.length > 0 && !can("stock.adjust"),
        },
      }
    }

    if (plan.rows.length === 0) return { status: 400, body: { error: "Nothing has been counted yet." } }
    // Adding products or batches is receiving stock; setting a price is editing a product.
    if (plan.rows.some((x) => x.kind === "new_product") && !can("products.create")) return denied("products.create")
    if (plan.rows.some((x) => x.kind !== "batch") && !can("stock.receive")) return denied("stock.receive")
    if (plan.pricesSet > 0 && !can("products.edit")) return denied("products.edit")

    if (plan.summary.approvalReasons.length > 0 && !can("stock.adjust")) {
      await db.update(stock_count).set({ status: "review", submitted_by: ctx.userId, submitted_at: new Date(), updated_at: new Date() }).where(eq(stock_count.id, id))
      return { status: 202, body: { status: "review", reasons: plan.summary.approvalReasons } }
    }
    const totals = await postSession(db, ctx, session, plan)
    const touched = [...new Set(plan.rows.map((x) => x.productId).filter(Boolean) as string[])]
    const codes = touched.length ? await db.select({ gtin: product.gtin, barcode_raw: product.barcode_raw }).from(product).where(inArray(product.id, touched)) : []
    return { status: 200, body: { status: "posted", totals }, codes: codes.flatMap((c) => [c.gtin, c.barcode_raw]) }
  })
  if (out.codes?.length) await invalidateBarcodeCache(ctx.organizationId, out.codes).catch(() => {})
  return NextResponse.json(out.body, { status: out.status })
}
