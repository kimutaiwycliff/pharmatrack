import { Q } from "@nozbe/watermelondb"
import { database } from "../../db/database"
import Product from "../../db/models/Product"
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
  const { products } = (await res.json()) as { products: ApiProduct[] }

  const collection = database.get<Product>("products")

  await database.write(async () => {
    const existing = await collection.query().fetch()
    const deletions = existing.map((p) => p.prepareDestroyPermanently())
    const creations = products.map((p) =>
      collection.prepareCreate((record) => {
        record.productId = p.product_id
        record.name = p.name
        record.brandName = p.brand_name
        record.genericName = p.generic_name
        record.strength = p.strength
        record.dosageForm = p.dosage_form
        record.baseUnit = p.base_unit
        record.packLabel = p.pack_label
        record.unitsPerPack = p.units_per_pack
        record.sellingPrice = p.selling_price
        record.costPrice = p.cost_price
        record.reorderLevel = p.reorder_level
        record.isControlled = p.is_controlled
        record.requiresPrescription = p.requires_prescription
        record.gtin = p.gtin
        record.barcodeRaw = p.barcode_raw
        record.categoryId = p.category_id
        record.isActive = p.is_active
        record.imageUrl = p.image_url
        record.maxDiscountPercent = p.max_discount_percent
        record.catalogId = p.catalog_id
        record.stockOnHand = p.stock_on_hand
        record.earliestExpiry = p.earliest_expiry
        record.batchCount = p.batch_count
      }),
    )
    await database.batch(...deletions, ...creations)
  })

  return { count: products.length }
}

export async function searchLocalProducts(query: string): Promise<Product[]> {
  const collection = database.get<Product>("products")
  if (!query.trim()) return collection.query(Q.take(50)).fetch()
  return collection
    .query(
      Q.or(
        Q.where("name", Q.like(`%${Q.sanitizeLikeString(query)}%`)),
        Q.where("brand_name", Q.like(`%${Q.sanitizeLikeString(query)}%`)),
        Q.where("barcode_raw", query),
        Q.where("gtin", query),
      ),
      Q.take(50),
    )
    .fetch()
}

export async function findByBarcode(code: string): Promise<Product | null> {
  const collection = database.get<Product>("products")
  const matches = await collection.query(Q.or(Q.where("barcode_raw", code), Q.where("gtin", code)), Q.take(1)).fetch()
  return matches[0] ?? null
}
