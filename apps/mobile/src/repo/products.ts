import { and, eq, like, or, sql } from "drizzle-orm"
import * as Crypto from "expo-crypto"
import { File } from "expo-file-system"
import { fromCents } from "@pharmatrack/core"
import { db } from "../db/database"
import { products, productPackSizes, type ProductRow } from "../db/schema"

// ADR-014 — local repo for the Products screen. Return shapes match the
// ONLINE app's API responses field-for-field so app/products.tsx's existing
// state/JSX needs no remapping. Owner/manager/pharmacist always see cost
// (no per-role cost-hiding in a single-user-per-device offline install —
// unlike the online app's lib/auth/costVisibility.ts).

function toListItem(r: ProductRow) {
  return {
    id: r.productId,
    category_id: r.categoryId,
    supplier_id: r.supplierId ?? null,
    name: r.name,
    brand_name: r.brandName,
    generic_name: r.genericName,
    manufacturer: r.manufacturer ?? null,
    gtin: r.gtin,
    barcode_raw: r.barcodeRaw,
    strength: r.strength,
    dosage_form: r.dosageForm,
    base_unit: r.baseUnit,
    pack_label: r.packLabel,
    units_per_pack: r.unitsPerPack,
    cost_price: r.costPrice != null ? String(r.costPrice) : null,
    selling_price: String(r.sellingPrice),
    reorder_level: r.reorderLevel,
    max_discount_percent: r.maxDiscountPercent != null ? String(r.maxDiscountPercent) : null,
    is_controlled: r.isControlled,
    requires_prescription: r.requiresPrescription,
    image_url: r.imageUrl,
    is_active: r.isActive,
  }
}

export async function listLocalProducts(opts: { page: number; limit: number; q?: string }) {
  const { page, limit, q } = opts
  const where = q && q.trim().length >= 2
    ? or(like(products.name, `%${q}%`), like(products.brandName, `%${q}%`), like(products.genericName, `%${q}%`))
    : undefined

  const countRow = where
    ? await db.select({ n: sql<number>`count(*)` }).from(products).where(where)
    : await db.select({ n: sql<number>`count(*)` }).from(products)
  const total = countRow[0]?.n ?? 0

  const rows = where
    ? await db.select().from(products).where(where).limit(limit).offset((page - 1) * limit)
    : await db.select().from(products).limit(limit).offset((page - 1) * limit)

  return { products: rows.map(toListItem), total, page, limit }
}

export async function getLocalProductDetail(id: string) {
  const [row] = await db.select().from(products).where(eq(products.productId, id)).limit(1)
  if (!row) return null
  const packRows = await db.select().from(productPackSizes).where(eq(productPackSizes.productId, id))
  return {
    product: {
      ...toListItem(row),
      cost_price: row.costPrice ?? null,
      selling_price: row.sellingPrice,
      max_discount_percent: row.maxDiscountPercent ?? null,
    },
    packSizes: packRows.map((p) => ({
      id: p.id,
      product_id: p.productId,
      pack_label: p.label,
      units_per_pack: p.unitCount,
      selling_price: Number(fromCents(p.sellingPriceCents)),
      barcode: p.barcode,
      is_active: p.isActive,
    })),
  }
}

export interface ProductWriteBody {
  name: string
  brand_name?: string | null
  generic_name?: string | null
  manufacturer?: string | null
  gtin?: string | null
  barcode_raw?: string | null
  strength?: string | null
  dosage_form?: string | null
  category_id?: string | null
  supplier_id?: string | null
  base_unit: string
  pack_label?: string | null
  units_per_pack?: number
  selling_price: number
  cost_price?: number | null
  reorder_level?: number
  max_discount_percent?: number | null
  is_controlled?: boolean
  requires_prescription?: boolean
  is_active?: boolean
}

export async function createLocalProduct(body: ProductWriteBody) {
  const id = Crypto.randomUUID()
  const row: typeof products.$inferInsert = {
    productId: id,
    name: body.name,
    brandName: body.brand_name ?? null,
    genericName: body.generic_name ?? null,
    manufacturer: body.manufacturer ?? null,
    strength: body.strength ?? null,
    dosageForm: body.dosage_form ?? null,
    baseUnit: body.base_unit,
    packLabel: body.pack_label ?? null,
    unitsPerPack: body.units_per_pack ?? 1,
    sellingPrice: body.selling_price,
    costPrice: body.cost_price ?? null,
    reorderLevel: body.reorder_level ?? 10,
    isControlled: body.is_controlled ?? false,
    requiresPrescription: body.requires_prescription ?? false,
    gtin: body.gtin ?? null,
    barcodeRaw: body.barcode_raw ?? null,
    categoryId: body.category_id ?? null,
    isActive: true,
    imageUrl: null,
    maxDiscountPercent: body.max_discount_percent ?? null,
    catalogId: null,
    stockOnHand: 0,
    earliestExpiry: null,
    batchCount: 0,
    supplierId: body.supplier_id ?? null,
  }
  await db.insert(products).values(row)
  return { product: { id } }
}

export async function updateLocalProduct(id: string, body: ProductWriteBody) {
  await db.update(products).set({
    name: body.name,
    brandName: body.brand_name ?? null,
    genericName: body.generic_name ?? null,
    manufacturer: body.manufacturer ?? null,
    strength: body.strength ?? null,
    dosageForm: body.dosage_form ?? null,
    baseUnit: body.base_unit,
    packLabel: body.pack_label ?? null,
    unitsPerPack: body.units_per_pack ?? 1,
    sellingPrice: body.selling_price,
    costPrice: body.cost_price ?? null,
    reorderLevel: body.reorder_level ?? 10,
    isControlled: body.is_controlled ?? false,
    requiresPrescription: body.requires_prescription ?? false,
    gtin: body.gtin ?? null,
    barcodeRaw: body.barcode_raw ?? null,
    categoryId: body.category_id ?? null,
    supplierId: body.supplier_id ?? null,
    maxDiscountPercent: body.max_discount_percent ?? null,
    isActive: body.is_active ?? true,
  }).where(eq(products.productId, id))
  const detail = await getLocalProductDetail(id)
  return { product: detail?.product }
}

export async function deleteLocalProduct(id: string): Promise<void> {
  const [row] = await db.select({ imageUrl: products.imageUrl }).from(products).where(eq(products.productId, id)).limit(1)
  if (row?.imageUrl) {
    try {
      new File(row.imageUrl).delete()
    } catch {
      // file already gone — nothing to clean up
    }
  }
  await db.delete(products).where(eq(products.productId, id))
  await db.delete(productPackSizes).where(eq(productPackSizes.productId, id))
}

/** Sets/clears a product's local photo. The value is always a file:// URI
 *  under Paths.document (see app/products.tsx's handlePickImage) — there's
 *  no MinIO/`/api/uploads/product-image` to upload to offline, so unlike the
 *  online app's relative `/api/media/<key>` URLs this is a device-local path
 *  an RN `<Image>` can render directly. */
export async function setLocalProductImage(id: string, imageUrl: string | null): Promise<void> {
  await db.update(products).set({ imageUrl }).where(eq(products.productId, id))
}

export interface PackSizeWriteBody {
  pack_label: string
  units_per_pack: number
  selling_price: number
  barcode?: string | null
}

export async function addLocalPackSize(productId: string, body: PackSizeWriteBody) {
  const id = Crypto.randomUUID()
  const sellingPriceCents = Math.round(body.selling_price * 100)
  await db.insert(productPackSizes).values({
    id, productId, label: body.pack_label, unitCount: body.units_per_pack,
    sellingPriceCents, barcode: body.barcode ?? null, isActive: true,
  })
  return {
    packSize: { id, product_id: productId, pack_label: body.pack_label, units_per_pack: body.units_per_pack, selling_price: body.selling_price, barcode: body.barcode ?? null, is_active: true },
  }
}

export async function updateLocalPackSize(productId: string, packId: string, body: PackSizeWriteBody) {
  const sellingPriceCents = Math.round(body.selling_price * 100)
  await db.update(productPackSizes).set({
    label: body.pack_label, unitCount: body.units_per_pack, sellingPriceCents, barcode: body.barcode ?? null,
  }).where(and(eq(productPackSizes.id, packId), eq(productPackSizes.productId, productId)))
  return {
    packSize: { id: packId, product_id: productId, pack_label: body.pack_label, units_per_pack: body.units_per_pack, selling_price: body.selling_price, barcode: body.barcode ?? null, is_active: true },
  }
}

export async function deleteLocalPackSize(productId: string, packId: string): Promise<void> {
  await db.delete(productPackSizes).where(and(eq(productPackSizes.id, packId), eq(productPackSizes.productId, productId)))
}
