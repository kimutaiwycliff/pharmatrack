import { eq, inArray, or, sql, count } from "drizzle-orm"
import {
  product, product_batch, sale_item, stock_adjustment, prescription_item, audit_log, type DrizzleDB,
} from "@pharmatrack/db"

export interface DeleteImpact {
  batches: number
  unitsOnHand: number
  saleLines: number
  adjustments: number
  prescriptionLines: number
  /** True when nothing references the product — a plain delete is safe. */
  clean: boolean
}

/** What a permanent delete would touch. Run under withTenant as a user who can
 *  see every branch, or the counts only cover the visible branch. */
export async function getDeleteImpact(db: DrizzleDB, productId: string): Promise<DeleteImpact> {
  const batchRows = await db.select({ id: product_batch.id, qty: product_batch.quantity_remaining })
    .from(product_batch).where(eq(product_batch.product_id, productId))
  const batchIds = batchRows.map((b) => b.id)

  const [[sales], [adjustments], [rx]] = await Promise.all([
    db.select({ n: count() }).from(sale_item).where(
      batchIds.length > 0 ? or(eq(sale_item.product_id, productId), inArray(sale_item.batch_id, batchIds)) : eq(sale_item.product_id, productId),
    ),
    batchIds.length > 0
      ? db.select({ n: count() }).from(stock_adjustment).where(inArray(stock_adjustment.batch_id, batchIds))
      : Promise.resolve([{ n: 0 }]),
    db.select({ n: count() }).from(prescription_item).where(eq(prescription_item.product_id, productId)),
  ])

  const impact = {
    batches: batchRows.length,
    unitsOnHand: batchRows.reduce((s, b) => s + b.qty, 0),
    saleLines: Number(sales?.n ?? 0),
    adjustments: Number(adjustments?.n ?? 0),
    prescriptionLines: Number(rx?.n ?? 0),
  }
  return { ...impact, clean: impact.batches === 0 && impact.saleLines === 0 && impact.prescriptionLines === 0 }
}

/**
 * Erase a product and everything that exists only because of it, in the
 * caller's transaction:
 *   - sale lines KEEP their row (receipts, revenue, controlled register stay
 *     intact — they already snapshot name/price/unit) and get the unit cost
 *     frozen onto them so profit reports survive; only the links are cleared
 *   - prescription lines keep their drug name, lose the product link
 *   - stock adjustments of its batches are removed (they can't exist without
 *     the batch), then the product goes, cascading batches + pack sizes
 *   - a full snapshot lands in audit_log
 */
export async function purgeProduct(
  db: DrizzleDB,
  args: { organizationId: string; actorId: string; productId: string },
): Promise<{ name: string; gtin: string | null; barcode_raw: string | null } | null> {
  const [existing] = await db.select().from(product).where(eq(product.id, args.productId)).limit(1)
  if (!existing) return null

  const impact = await getDeleteImpact(db, args.productId)
  const batchRows = await db.select().from(product_batch).where(eq(product_batch.product_id, args.productId))
  const batchIds = batchRows.map((b) => b.id)

  await db.update(sale_item).set({
    unit_cost: sql`coalesce(${sale_item.unit_cost}, (select pb.cost_price from product_batch pb where pb.id = ${sale_item.batch_id}), ${existing.cost_price})`,
    product_id: null,
    batch_id: null,
  }).where(
    batchIds.length > 0
      ? or(eq(sale_item.product_id, args.productId), inArray(sale_item.batch_id, batchIds))
      : eq(sale_item.product_id, args.productId),
  )

  await db.update(prescription_item).set({ product_id: null }).where(eq(prescription_item.product_id, args.productId))

  if (batchIds.length > 0) {
    await db.delete(stock_adjustment).where(inArray(stock_adjustment.batch_id, batchIds))
  }

  await db.delete(product).where(eq(product.id, args.productId))

  await db.insert(audit_log).values({
    organization_id: args.organizationId,
    actor_id: args.actorId,
    action: "product.delete_permanent",
    entity: "product",
    entity_id: args.productId,
    diff: {
      product: existing,
      impact,
      batches: batchRows.map((b) => ({
        id: b.id, branch_id: b.branch_id, batch_number: b.batch_number, expiry_date: b.expiry_date,
        quantity_received: b.quantity_received, quantity_remaining: b.quantity_remaining, cost_price: b.cost_price,
      })),
    },
  })

  return { name: existing.name, gtin: existing.gtin, barcode_raw: existing.barcode_raw }
}
