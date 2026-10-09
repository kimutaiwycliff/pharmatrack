import { and, asc, eq, inArray } from "drizzle-orm"
import {
  purchase_order, purchase_order_item, supplier, branch, user, product, product_stock, type DrizzleDB,
} from "@pharmatrack/db"
import { serializePo, serializePoItem, type PurchaseOrderDTO, type PurchaseOrderItemDTO } from "./serialize"

export interface PurchaseOrderDetail extends PurchaseOrderDTO {
  items: Array<PurchaseOrderItemDTO & { gtin: string | null; barcode_raw: string | null; base_unit: string | null; stock_on_hand: number | null }>
}

/** Full PO with lines, supplier contact and each product's current stock at
 *  the PO's branch. Costs are stripped when the viewer can't see cost. */
export async function loadPurchaseOrder(db: DrizzleDB, id: string, canSeeCost: boolean): Promise<PurchaseOrderDetail | null> {
  const [row] = await db.select({
    po: purchase_order, supplier_name: supplier.name, supplier_phone: supplier.phone, supplier_email: supplier.email,
    branch_name: branch.name, created_by_name: user.name,
  }).from(purchase_order)
    .leftJoin(supplier, eq(supplier.id, purchase_order.supplier_id))
    .leftJoin(branch, eq(branch.id, purchase_order.branch_id))
    .leftJoin(user, eq(user.id, purchase_order.created_by))
    .where(eq(purchase_order.id, id)).limit(1)
  if (!row) return null

  const itemRows = await db.select().from(purchase_order_item)
    .where(eq(purchase_order_item.purchase_order_id, id))
    .orderBy(asc(purchase_order_item.sort_order))
  const productIds = itemRows.map((i) => i.product_id).filter((p): p is string => !!p)
  const products = productIds.length === 0 ? [] : await db.select({
    id: product.id, gtin: product.gtin, barcode_raw: product.barcode_raw, base_unit: product.base_unit,
  }).from(product).where(inArray(product.id, productIds))
  const stock = productIds.length === 0 ? [] : await db.select({ id: product_stock.product_id, soh: product_stock.stock_on_hand })
    .from(product_stock).where(and(eq(product_stock.branch_id, row.po.branch_id), inArray(product_stock.product_id, productIds)))
  const pMap = new Map(products.map((p) => [p.id, p]))
  const sMap = new Map(stock.map((s) => [s.id!, s.soh ?? 0]))

  const items = itemRows.map((r) => {
    const base = serializePoItem(r)
    const p = r.product_id ? pMap.get(r.product_id) : undefined
    return {
      ...base,
      unit_cost: canSeeCost ? base.unit_cost : null,
      line_total: canSeeCost ? base.line_total : null,
      gtin: p?.gtin ?? null, barcode_raw: p?.barcode_raw ?? null, base_unit: p?.base_unit ?? null,
      stock_on_hand: r.product_id ? sMap.get(r.product_id) ?? 0 : null,
    }
  })
  const header = serializePo(row.po, {
    supplier_name: row.supplier_name, supplier_phone: row.supplier_phone, supplier_email: row.supplier_email,
    branch_name: row.branch_name, created_by_name: row.created_by_name, items,
  })
  return { ...header, total: canSeeCost ? header.total : null, items }
}
