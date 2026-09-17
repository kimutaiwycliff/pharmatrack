import { eq, isNotNull, sql } from "drizzle-orm"
import * as Crypto from "expo-crypto"
import { db } from "../db/database"
import { drugCatalog, products, productBatches, saleItems } from "../db/schema"
import { KEML_CATALOG } from "../data/keml-catalog"
import { findOrCreateCategoryId } from "./inventory"

// ADR-014 — local repo for the "Drug catalog" quick-seed screen
// (app/catalog-seed.tsx). Mirrors apps/web/app/api/catalog/seed/route.ts's
// GET/POST/DELETE contract field-for-field, against the bundled
// data/keml-catalog.ts dataset instead of a live drug_catalog table — see
// that file for why it's the ~95-row KEML set specifically, not the larger
// enriched online catalogue. Unlike the online route (which creates seeded
// products ACTIVE and PRICED using pricing this offline dataset doesn't
// have), seeded products here are created INACTIVE with a zero selling
// price — matching CLAUDE.md §6.4's original "inactive + unpriced until
// reviewed" description, appropriate since there's no real price to seed.

async function ensureCatalogSeeded(): Promise<void> {
  const [row] = await db.select({ n: sql<number>`count(*)` }).from(drugCatalog)
  if ((row?.n ?? 0) > 0) return
  for (const entry of KEML_CATALOG) {
    await db.insert(drugCatalog).values({
      id: entry.id, name: entry.name, strength: entry.strength, dosageForm: entry.dosageForm,
      baseUnit: entry.baseUnit, isControlled: entry.isControlled, requiresPrescription: entry.requiresPrescription,
      category: entry.category,
    })
  }
}

async function seededCatalogIds(): Promise<Set<string>> {
  const rows = await db.select({ catalogId: products.catalogId }).from(products).where(isNotNull(products.catalogId))
  return new Set(rows.map((r) => r.catalogId!))
}

export interface CatalogDepartment { category: string; total: number; seeded: number }

export async function getLocalCatalogSeedStatus(): Promise<{ departments: CatalogDepartment[]; catalogTotal: number; seeded: number }> {
  await ensureCatalogSeeded()
  const catalog = await db.select().from(drugCatalog)
  const seededIds = await seededCatalogIds()

  const byCategory = new Map<string, { total: number; seeded: number }>()
  for (const entry of catalog) {
    const cat = entry.category ?? "Other"
    const bucket = byCategory.get(cat) ?? { total: 0, seeded: 0 }
    bucket.total += 1
    if (seededIds.has(entry.id)) bucket.seeded += 1
    byCategory.set(cat, bucket)
  }

  return {
    departments: Array.from(byCategory.entries()).map(([category, v]) => ({ category, total: v.total, seeded: v.seeded })),
    catalogTotal: catalog.length,
    seeded: catalog.filter((c) => seededIds.has(c.id)).length,
  }
}

export async function seedLocalCatalog(categories?: string[]): Promise<{ seeded: number; updated: number }> {
  await ensureCatalogSeeded()
  const catalog = await db.select().from(drugCatalog)
  const seededIds = await seededCatalogIds()
  const toSeed = catalog.filter((c) => (!categories || categories.includes(c.category ?? "Other")) && !seededIds.has(c.id))

  for (const entry of toSeed) {
    const categoryId = await findOrCreateCategoryId(entry.category ?? undefined, undefined)
    await db.insert(products).values({
      productId: Crypto.randomUUID(),
      name: entry.name,
      brandName: null,
      genericName: null,
      manufacturer: null,
      strength: entry.strength,
      dosageForm: entry.dosageForm,
      baseUnit: entry.baseUnit,
      packLabel: null,
      unitsPerPack: 1,
      sellingPrice: 0,
      costPrice: null,
      reorderLevel: 3,
      isControlled: entry.isControlled,
      requiresPrescription: entry.requiresPrescription,
      gtin: null,
      barcodeRaw: null,
      categoryId,
      isActive: false,
      imageUrl: null,
      maxDiscountPercent: null,
      catalogId: entry.id,
      stockOnHand: 0,
      earliestExpiry: null,
      batchCount: 0,
      supplierId: null,
    })
  }

  return { seeded: toSeed.length, updated: 0 }
}

export async function unseedLocalCatalog(): Promise<{ removed: number; kept: number }> {
  const seededProducts = await db.select({ productId: products.productId }).from(products).where(isNotNull(products.catalogId))
  let removed = 0
  let kept = 0
  for (const p of seededProducts) {
    const [batch] = await db.select({ n: sql<number>`count(*)` }).from(productBatches).where(eq(productBatches.productId, p.productId))
    const [sale] = await db.select({ n: sql<number>`count(*)` }).from(saleItems).where(eq(saleItems.productId, p.productId))
    const touched = (batch?.n ?? 0) > 0 || (sale?.n ?? 0) > 0
    if (touched) {
      kept++
      continue
    }
    await db.delete(products).where(eq(products.productId, p.productId))
    removed++
  }
  return { removed, kept }
}
