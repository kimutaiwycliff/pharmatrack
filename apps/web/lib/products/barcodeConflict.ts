import { and, eq, ne, or } from "drizzle-orm"
import { product, product_pack_size, type DrizzleDB } from "@pharmatrack/db"

// A barcode (product.gtin, product.barcode_raw, or product_pack_size.barcode) must
// resolve to exactly one thing per org, or POS/receive-stock scanning becomes
// ambiguous. RLS already scopes both tables to the caller's org.
export async function findBarcodeConflict(
  db: DrizzleDB,
  organizationId: string,
  codes: Array<string | null | undefined>,
  exclude: { productId?: string; packSizeId?: string } = {},
): Promise<string | null> {
  const values = [...new Set(codes.filter((c): c is string => !!c))]
  if (values.length === 0) return null

  const productConds = values.flatMap((v) => [eq(product.gtin, v), eq(product.barcode_raw, v)])
  const [productHit] = await db.select({ name: product.name }).from(product)
    .where(and(
      eq(product.organization_id, organizationId),
      exclude.productId ? ne(product.id, exclude.productId) : undefined,
      or(...productConds),
    )).limit(1)
  if (productHit) return productHit.name

  const packConds = values.map((v) => eq(product_pack_size.barcode, v))
  const [packHit] = await db.select({ name: product.name }).from(product_pack_size)
    .innerJoin(product, eq(product_pack_size.product_id, product.id))
    .where(and(
      exclude.packSizeId ? ne(product_pack_size.id, exclude.packSizeId) : undefined,
      or(...packConds),
    )).limit(1)
  return packHit?.name ?? null
}
