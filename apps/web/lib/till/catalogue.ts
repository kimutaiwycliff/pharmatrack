"use client"

import { sellableQty, type SalePayload } from "@pharmatrack/core/sync"
import type { CartSellUnit, ProductWithStock } from "@pharmatrack/types"
import { tillDB, type TillProduct } from "./db"

// Product search / barcode lookup for a registered till, straight from
// IndexedDB — instant, and identical online and offline.
//
// "In stock" shown to the cashier: while online, the branch stock (the till
// tops up its allowance from the server at checkout if it needs more);
// offline, only what this computer may sell — min(allowance, stock) — so the
// cart can never promise what the till can't record.

async function stockFor(products: TillProduct[], online: boolean): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (online) {
    for (const p of products) out.set(p.id, p.stock_on_hand)
    return out
  }
  const allowances = await tillDB().allowances.bulkGet(products.map((p) => p.id))
  products.forEach((p, i) => out.set(p.id, sellableQty(allowances[i]?.quantity, p.stock_on_hand)))
  return out
}

function toRow(p: TillProduct, branchId: string, stock: number): ProductWithStock {
  return {
    product_id: p.id, branch_id: branchId, organization_id: null, name: p.name, brand_name: p.brand_name, strength: p.strength,
    dosage_form: p.dosage_form, gtin: p.gtin, barcode_raw: p.barcode_raw, base_unit: p.base_unit, units_per_pack: p.units_per_pack,
    pack_label: p.pack_label, selling_price: p.selling_price, cost_price: null, category_id: p.category_id, reorder_level: null,
    requires_prescription: p.requires_prescription, is_controlled: p.is_controlled, is_active: p.is_active, image_url: p.image_url,
    max_discount_percent: p.max_discount_percent, stock_on_hand: stock, earliest_expiry: p.earliest_expiry, batch_count: null,
  }
}

async function rows(products: TillProduct[], branchId: string, online: boolean): Promise<ProductWithStock[]> {
  const stock = await stockFor(products, online)
  return products.map((p) => toRow(p, branchId, stock.get(p.id) ?? 0))
}

export async function searchTill(query: string, branchId: string, online: boolean, limit = 20): Promise<ProductWithStock[]> {
  const q = query.trim().toLowerCase()
  if (q.length < 2) return []
  const all = await tillDB().products.filter((p) => p.is_active && (p.search.includes(q) || (!!p.gtin && p.gtin.startsWith(q)) || p.barcode_raw === q)).toArray()
  // Names that start with the query first, then the rest, alphabetically.
  all.sort((a, b) => Number(!a.search.startsWith(q)) - Number(!b.search.startsWith(q)) || a.name.localeCompare(b.name))
  return rows(all.slice(0, limit), branchId, online)
}

/** Quick-add grid: what this computer sold most in the last two weeks, then other in-stock products. */
export async function featuredTill(branchId: string, online: boolean, limit = 8): Promise<ProductWithStock[]> {
  const db = tillDB()
  const since = Date.now() - 14 * 86_400_000
  const sales = await db.outbox.where("type").equals("sale").and((r) => r.created_at >= since).toArray()
  const counts = new Map<string, number>()
  for (const s of sales) for (const it of (s.payload as SalePayload).items) counts.set(it.product_id, (counts.get(it.product_id) ?? 0) + 1)
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id).slice(0, limit)
  const picked = (await db.products.bulkGet(top)).filter((p): p is TillProduct => !!p && p.is_active)
  if (picked.length < limit) {
    const have = new Set(picked.map((p) => p.id))
    const more = await db.products.filter((p) => p.is_active && p.stock_on_hand > 0 && p.selling_price > 0 && !have.has(p.id)).limit(limit - picked.length).toArray()
    picked.push(...more)
  }
  return rows(picked, branchId, online)
}

export interface TillLookup {
  found: boolean
  product?: ProductWithStock
  pack?: CartSellUnit
}

/** Barcode → product (product GTIN / raw barcode, or a pack-size barcode). */
export async function lookupTill(barcode: string, branchId: string, online: boolean): Promise<TillLookup> {
  const db = tillDB()
  const code = barcode.trim()
  let product = (await db.products.where("gtin").equals(code).first()) ?? (await db.products.where("barcode_raw").equals(code).first())
  let pack: CartSellUnit | undefined
  if (!product) {
    const pk = await db.packs.where("barcode").equals(code).first()
    if (pk?.is_active) {
      product = await db.products.get(pk.product_id)
      pack = { pack_size_id: pk.id, label: pk.label, unit_count: pk.unit_count, price: pk.selling_price }
    }
  }
  if (!product || !product.is_active) return { found: false }
  const [row] = await rows([product], branchId, online)
  return { found: true, product: row, pack }
}
