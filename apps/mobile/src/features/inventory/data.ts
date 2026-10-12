import { eq, like, or } from "drizzle-orm"
import { normalizeGTIN } from "@pharmatrack/core"
import { create } from "zustand"
import { db } from "../../db/database"
import { products, type ProductRow } from "../../db/schema"
import { apiJson, withQuery } from "../../lib/api"
import { env } from "../../lib/env"
import { listLocalBatches, listLocalInventory } from "../../repo/inventory"
import type { Batch, InventoryResponse, ReceiveProduct } from "./logic/types"
import type { StatusFilter } from "./logic/status"

// Data access for the Inventory feature. Online: the web routes (read for
// their exact shapes — see logic/types.ts). Offline Edition: src/repo/inventory.ts
// plus the local `products` table, which is that build's source of truth.
// Never call apiJson when env.EXPO_PUBLIC_OFFLINE_MODE is set.

const OFFLINE = env.EXPO_PUBLIC_OFFLINE_MODE
export const PAGE_SIZE = 20

export async function fetchInventoryPage(opts: {
  page: number
  status: StatusFilter
  q: string
  branchId: string | undefined
}): Promise<InventoryResponse> {
  const q = opts.q.trim().length >= 2 ? opts.q.trim() : undefined
  if (OFFLINE) {
    return listLocalInventory({ status: opts.status, page: opts.page, limit: PAGE_SIZE, q })
  }
  return apiJson<InventoryResponse>(
    withQuery("/api/inventory", { branch_id: opts.branchId, status: opts.status, page: opts.page, limit: PAGE_SIZE, q }),
  )
}

/** branchId undefined = every branch (online only; each row carries branch_name). */
export async function fetchBatches(productId: string, branchId: string | undefined): Promise<Batch[]> {
  if (OFFLINE) {
    if (!branchId) return []
    return (await listLocalBatches(productId, branchId)).batches
  }
  const json = await apiJson<{ batches: Batch[] }>(withQuery("/api/batches", { product_id: productId, branch_id: branchId }))
  return json.batches ?? []
}

// ── Receive-stock product picking ────────────────────────────────────────────

const num = (v: unknown): number | null => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null)

function fromLocal(r: ProductRow): ReceiveProduct {
  return {
    id: r.productId,
    name: r.name,
    strength: r.strength,
    brand_name: r.brandName,
    gtin: r.gtin,
    barcode_raw: r.barcodeRaw,
    base_unit: r.baseUnit,
    pack_label: r.packLabel,
    units_per_pack: r.unitsPerPack,
    cost_price: r.costPrice,
    stock_on_hand: r.stockOnHand,
  }
}

/** Any API product shape (search row keyed product_id, product row keyed id). */
function fromApi(p: Record<string, unknown>): ReceiveProduct {
  return {
    id: String(p.product_id ?? p.id),
    name: String(p.name ?? ""),
    strength: (p.strength as string | null) ?? null,
    brand_name: (p.brand_name as string | null) ?? null,
    gtin: (p.gtin as string | null) ?? null,
    barcode_raw: (p.barcode_raw as string | null) ?? null,
    base_unit: (p.base_unit as string | null) ?? null,
    pack_label: (p.pack_label as string | null) ?? null,
    units_per_pack: num(p.units_per_pack),
    // Absent (not null) when the role can't see cost — keep it undefined.
    cost_price: "cost_price" in p ? num(p.cost_price) : undefined,
    stock_on_hand: num(p.stock_on_hand),
  }
}

export async function searchReceiveProducts(q: string, branchId: string | null): Promise<ReceiveProduct[]> {
  const t = q.trim()
  if (t.length < 2) return []
  if (OFFLINE) {
    const rows = await db
      .select()
      .from(products)
      .where(or(like(products.name, `%${t}%`), like(products.brandName, `%${t}%`), like(products.genericName, `%${t}%`), eq(products.gtin, t)))
      .limit(30)
    return rows.map(fromLocal)
  }
  const json = await apiJson<{ products: Record<string, unknown>[] }>(
    withQuery("/api/products/search", { q: t, branch_id: branchId, context: "receive" }),
  )
  return (json.products ?? []).map(fromApi)
}

export async function getReceiveProduct(productId: string): Promise<ReceiveProduct | null> {
  if (OFFLINE) {
    const [row] = await db.select().from(products).where(eq(products.productId, productId)).limit(1)
    return row ? fromLocal(row) : null
  }
  const json = await apiJson<{ product: Record<string, unknown> }>(`/api/products/${encodeURIComponent(productId)}`)
  return json.product ? fromApi(json.product) : null
}

/** Product for a scanned code: GTIN first (what web's receive form looks up), then the raw code. */
export async function lookupReceiveProduct(codes: (string | null)[], branchId: string | null): Promise<ReceiveProduct | null> {
  const tried = new Set<string>()
  for (const code of codes) {
    if (!code || tried.has(code)) continue
    tried.add(code)
    if (OFFLINE) {
      const gtin = /^\d{8,14}$/.test(code) ? normalizeGTIN(code) : code
      const [row] = await db
        .select()
        .from(products)
        .where(or(eq(products.gtin, code), eq(products.gtin, gtin), eq(products.barcodeRaw, code)))
        .limit(1)
      if (row) return fromLocal(row)
      continue
    }
    const json = await apiJson<{ found: boolean; product?: Record<string, unknown> }>(
      withQuery("/api/products/lookup", { barcode: code, branch_id: branchId, context: "receive" }),
    )
    if (json.found && json.product) return fromApi(json.product)
  }
  return null
}

export async function listSuppliers(): Promise<{ id: string; name: string }[]> {
  if (OFFLINE) return []
  const json = await apiJson<{ suppliers: { id: string; name: string }[] }>("/api/suppliers")
  return json.suppliers ?? []
}

// ── Cross-screen refresh ─────────────────────────────────────────────────────
// Receiving/adjusting happens on other routes (or the tablet detail pane);
// bumping a version that's part of the list's query key makes the inventory
// list and batch views reload when they're next shown.

interface InventoryVersionState {
  list: number
  batches: number
  bumpList: () => void
  bumpAll: () => void
}

export const useInventoryVersion = create<InventoryVersionState>((set) => ({
  list: 0,
  batches: 0,
  bumpList: () => set((s) => ({ list: s.list + 1 })),
  bumpAll: () => set((s) => ({ list: s.list + 1, batches: s.batches + 1 })),
}))
