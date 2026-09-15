import { NextResponse } from "next/server"
import { isNull, and, eq } from "drizzle-orm"
import { withTenant, product, product_pack_size } from "@pharmatrack/db"
import { generateInternalBarcode } from "@pharmatrack/core"
import { getTenantContext, type Role, requireActiveSubscription } from "@/lib/auth/helpers"
import { findBarcodeConflict } from "@/lib/products/barcodeConflict"

const MAX_BARCODE_GENERATION_ATTEMPTS = 5

interface GeneratedItem {
  code: string
  productName: string
}

// Bulk-assigns an internal barcode to every product and pack size in the
// caller's org that has neither a manufacturer GTIN nor a barcode already,
// and reports back what was generated (code + product name) — powers the
// "print labels for unbarcoded stock" bulk action (existing inventory
// created before barcode auto-generation shipped, or added via CSV import,
// wouldn't otherwise have one).
export async function POST() {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const subErr = await requireActiveSubscription(ctx.organizationId)
  if (subErr) return subErr
  if (!(["owner", "manager", "pharmacist"] as Role[]).includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const organizationId = ctx.organizationId

  const items = await withTenant(ctx, async (db) => {
    async function assignBarcode(): Promise<string | null> {
      for (let attempt = 0; attempt < MAX_BARCODE_GENERATION_ATTEMPTS; attempt++) {
        const candidate = generateInternalBarcode()
        const conflict = await findBarcodeConflict(db, organizationId, [candidate])
        if (!conflict) return candidate
      }
      return null
    }

    const generated: GeneratedItem[] = []

    const productsToFix = await db.select({ id: product.id, name: product.name }).from(product)
      .where(and(isNull(product.gtin), isNull(product.barcode_raw)))
    for (const p of productsToFix) {
      const barcode = await assignBarcode()
      if (!barcode) continue
      await db.update(product).set({ barcode_raw: barcode }).where(eq(product.id, p.id))
      generated.push({ code: barcode, productName: p.name })
    }

    const packSizesToFix = await db.select({ id: product_pack_size.id, label: product_pack_size.label, productName: product.name })
      .from(product_pack_size)
      .innerJoin(product, eq(product_pack_size.product_id, product.id))
      .where(isNull(product_pack_size.barcode))
    for (const ps of packSizesToFix) {
      const barcode = await assignBarcode()
      if (!barcode) continue
      await db.update(product_pack_size).set({ barcode }).where(eq(product_pack_size.id, ps.id))
      generated.push({ code: barcode, productName: `${ps.productName} — ${ps.label}` })
    }

    return generated
  })

  return NextResponse.json({ items })
}
