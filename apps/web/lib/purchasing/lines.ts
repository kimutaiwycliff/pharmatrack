import { z } from "zod"
import { inArray } from "drizzle-orm"
import { product, type DrizzleDB } from "@pharmatrack/db"
import { zUuid } from "@/lib/api/validation"

export const poItemInput = z.object({
  product_id: zUuid(),
  quantity_ordered: z.number().int().positive().max(100_000),
  unit_cost: z.number().nonnegative().nullable().optional(),
  pack_label: z.string().trim().max(60).nullable().optional(),
  units_per_pack: z.number().int().positive().max(100_000).optional(),
})


/** Shared by create + edit: build PO lines from product data (name/strength/
 *  pack snapshot) so the PDF and history don't depend on later product edits. */
export async function buildPoLines(
  db: DrizzleDB,
  items: z.infer<typeof poItemInput>[],
  canSeeCost: boolean,
) {
  const products = await db.select({
    id: product.id, name: product.name, strength: product.strength, pack_label: product.pack_label,
    units_per_pack: product.units_per_pack, cost_price: product.cost_price,
  }).from(product).where(inArray(product.id, items.map((i) => i.product_id)))
  const map = new Map(products.map((p) => [p.id, p]))
  return items.map((i, idx) => {
    const p = map.get(i.product_id)
    if (!p) throw new Error(`Unknown product ${i.product_id}`)
    const upp = i.units_per_pack ?? p.units_per_pack ?? 1
    // Without cost permission, never accept a client-sent cost; fall back to
    // the product's cost so the budget stays meaningful for whoever can see it.
    const fallback = p.cost_price == null ? null : Number(p.cost_price) * upp
    const cost = canSeeCost && i.unit_cost !== undefined ? i.unit_cost : fallback
    return {
      product_id: p.id,
      product_name: p.name,
      product_strength: p.strength,
      pack_label: i.pack_label ?? p.pack_label ?? (upp > 1 ? `Pack of ${upp}` : null),
      units_per_pack: upp,
      quantity_ordered: i.quantity_ordered,
      unit_cost: cost == null ? null : (Math.round(cost * 100) / 100).toFixed(2),
      sort_order: idx,
    }
  })
}

