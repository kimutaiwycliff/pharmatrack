import { eq, like, or } from "drizzle-orm"
import { db } from "../../db/database"
import { products, type ProductRow } from "../../db/schema"
import { apiFetch } from "../api-fetch"

// Shape of one row from the `product_stock` view, as returned by
// GET /api/products/search?all=1&branch_id= (apps/web/app/api/products/search/route.ts).
interface ApiProduct {
  product_id: string
  name: string
  brand_name: string | null
  generic_name: string | null
  strength: string | null
  dosage_form: string | null
  base_unit: string
  pack_label: string | null
  units_per_pack: number
  selling_price: number
  cost_price: number | null
  reorder_level: number
  is_controlled: boolean
  requires_prescription: boolean
  gtin: string | null
  barcode_raw: string | null
  category_id: string | null
  is_active: boolean
  image_url: string | null
  max_discount_percent: number | null
  catalog_id: string | null
  stock_on_hand: number
  earliest_expiry: string | null
  batch_count: number
}

// Full-set refetch, no incremental cursor — matches the existing Dexie
// algorithm (apps/web/lib/offline/sync.ts) and the endpoint's own shape
// (always returns the whole branch catalogue, capped at 5000 rows). Runs on
// login, app foreground, and reconnect (wired in app/pos.tsx).
export async function syncCatalogue(branchId: string): Promise<{ count: number }> {
  const res = await apiFetch(`/api/products/search?all=1&branch_id=${branchId}`)
  if (!res.ok) throw new Error(`Catalogue sync failed: ${res.status}`)
  const { products: apiProducts } = (await res.json()) as { products: ApiProduct[] }

  await db.transaction(async (tx) => {
    await tx.delete(products)
    if (apiProducts.length === 0) return
    await tx.insert(products).values(
      apiProducts.map((p) => ({
        productId: p.product_id,
        name: p.name,
        brandName: p.brand_name,
        genericName: p.generic_name,
        strength: p.strength,
        dosageForm: p.dosage_form,
        baseUnit: p.base_unit,
        packLabel: p.pack_label,
        unitsPerPack: p.units_per_pack,
        sellingPrice: p.selling_price,
        costPrice: p.cost_price,
        reorderLevel: p.reorder_level,
        isControlled: p.is_controlled,
        requiresPrescription: p.requires_prescription,
        gtin: p.gtin,
        barcodeRaw: p.barcode_raw,
        categoryId: p.category_id,
        isActive: p.is_active,
        imageUrl: p.image_url,
        maxDiscountPercent: p.max_discount_percent,
        catalogId: p.catalog_id,
        stockOnHand: p.stock_on_hand,
        earliestExpiry: p.earliest_expiry,
        batchCount: p.batch_count,
      })),
    )
  })

  return { count: apiProducts.length }
}

export async function searchLocalProducts(query: string): Promise<ProductRow[]> {
  if (!query.trim()) return db.select().from(products).limit(50)
  const like_ = `%${query}%`
  return db
    .select()
    .from(products)
    .where(or(like(products.name, like_), like(products.brandName, like_), eq(products.barcodeRaw, query), eq(products.gtin, query)))
    .limit(50)
}

export async function findByBarcode(code: string): Promise<ProductRow | null> {
  const matches = await db
    .select()
    .from(products)
    .where(or(eq(products.barcodeRaw, code), eq(products.gtin, code)))
    .limit(1)
  return matches[0] ?? null
}
