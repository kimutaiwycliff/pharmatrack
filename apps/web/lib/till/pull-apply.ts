import { allowanceRows, localStock } from "@pharmatrack/core/sync"
import { getMeta, setMeta, tillDB, type TillDB, type TillProduct, type TillStaff } from "./db"
import { pendingSaleQuantities } from "./outbox"

// Applies one page of GET /api/sync/pull (lib/sync/pull.ts) in ONE Dexie
// transaction — the IndexedDB twin of apps/mobile/src/lib/sync/pull-apply.ts.
// Products page by (updated_at, id); everything else (pack sizes, roster,
// tombstones, stock, allocation) arrives on the first page only, so it's
// applied only when `first` is true — a later page's empty staff[] must never
// wipe the roster.

export interface PullProduct {
  id: string
  name: string
  brand_name: string | null
  generic_name: string | null
  strength: string | null
  dosage_form: string | null
  base_unit: string | null
  pack_label: string | null
  units_per_pack: number | null
  selling_price: number | null
  max_discount_percent: number | null
  gtin: string | null
  barcode_raw: string | null
  category_id: string | null
  image_url: string | null
  is_controlled: boolean
  requires_prescription: boolean
  is_active: boolean
  updated_at: string
}

export interface PullStaff {
  id: string
  name: string
  role: string
  phone: string | null
  branch_id: string | null
  is_active: boolean
  pin_hash: string | null
  permissions: string[]
}

export interface PullResponse {
  server_time: string
  deadline: string
  cursor: string
  has_more: boolean
  next: { ts: string; id: string } | null
  full: boolean
  device?: { id: string; name: string; code: string; branch_id: string }
  organization?: { id: string; name: string | null }
  branch?: { id: string; name: string | null; address: string | null; phone: string | null }
  products: PullProduct[]
  pack_sizes: { id: string; product_id: string; label: string; unit_count: number; selling_price: number | null; barcode: string | null; is_active: boolean }[]
  categories: { id: string; parent_id: string | null; name: string }[]
  staff: PullStaff[]
  tombstones: { entity: string; id: string }[]
  stock: { product_id: string; stock_on_hand: number; earliest_expiry: string | null }[]
  allocation: { items: { product_id: string; quantity: number }[]; reserved_until: string; share: number } | null
}

export interface PullContext {
  first: boolean
  last: boolean
  /** refresh_allocation=1 was sent */
  refreshedAllocation: boolean
  /** first page's stock, kept for products that arrive on later pages */
  stockMap: Map<string, { qty: number; expiry: string | null }>
  /** full download: ids seen across pages, so stale local rows can be dropped at the end */
  seenProducts: Set<string> | null
  seenPacks: Set<string> | null
}

export interface PageCounts {
  products: number
  deleted: number
}

export function newPullContext(full: boolean, refreshedAllocation: boolean): PullContext {
  return {
    first: true, last: false, refreshedAllocation, stockMap: new Map(),
    seenProducts: full ? new Set() : null, seenPacks: full ? new Set() : null,
  }
}

const searchText = (p: Pick<PullProduct, "name" | "brand_name" | "generic_name" | "strength">) =>
  [p.name, p.brand_name, p.generic_name, p.strength].filter(Boolean).join(" ").toLowerCase()

async function deleteProducts(db: TillDB, ids: string[]): Promise<void> {
  if (ids.length === 0) return
  await db.products.bulkDelete(ids)
  await db.packs.where("product_id").anyOf(ids).delete()
  await db.allowances.bulkDelete(ids)
}

export async function applyPullPage(body: PullResponse, ctx: PullContext, db: TillDB = tillDB()): Promise<PageCounts> {
  const counts: PageCounts = { products: 0, deleted: 0 }

  await db.transaction("rw", [db.products, db.packs, db.staff, db.allowances, db.outbox, db.meta], async () => {
    // Read inside the transaction, so a sale committed while this page was
    // downloading is included — its units come off the server's numbers too.
    const pending = await pendingSaleQuantities(db)
    if (ctx.first) {
      ctx.stockMap.clear()
      for (const s of body.stock) ctx.stockMap.set(s.product_id, { qty: s.stock_on_hand, expiry: s.earliest_expiry })
    }

    // ── Products (every page). On later pages an existing row keeps its
    // stock; the first page's full stock replace below owns that.
    if (body.products.length > 0) {
      const existing = await db.products.bulkGet(body.products.map((p) => p.id))
      const rows: TillProduct[] = body.products.map((p, i) => {
        const prev = existing[i]
        const keep = !!prev && !ctx.first
        return {
          id: p.id, name: p.name, search: searchText(p), brand_name: p.brand_name, generic_name: p.generic_name,
          strength: p.strength, dosage_form: p.dosage_form, base_unit: p.base_unit ?? "unit", pack_label: p.pack_label,
          units_per_pack: p.units_per_pack ?? 1, selling_price: p.selling_price ?? 0, max_discount_percent: p.max_discount_percent,
          gtin: p.gtin, barcode_raw: p.barcode_raw, category_id: p.category_id, image_url: p.image_url,
          is_controlled: p.is_controlled, requires_prescription: p.requires_prescription, is_active: p.is_active,
          stock_on_hand: keep ? prev.stock_on_hand : localStock(ctx.stockMap.get(p.id)?.qty, pending.get(p.id)),
          earliest_expiry: keep ? prev.earliest_expiry : (ctx.stockMap.get(p.id)?.expiry ?? null),
        }
      })
      await db.products.bulkPut(rows)
      for (const p of body.products) ctx.seenProducts?.add(p.id)
      counts.products += rows.length
    }

    if (ctx.first) {
      if (body.pack_sizes.length > 0) {
        await db.packs.bulkPut(body.pack_sizes.map((pk) => ({
          id: pk.id, product_id: pk.product_id, label: pk.label, unit_count: pk.unit_count,
          selling_price: pk.selling_price ?? 0, barcode: pk.barcode, is_active: pk.is_active,
        })))
        for (const pk of body.pack_sizes) ctx.seenPacks?.add(pk.id)
      }

      // Roster: always the full list for this branch — replace it, keeping
      // each person's lockout counter unless their PIN changed.
      const old = new Map((await db.staff.toArray()).map((s) => [s.id, s]))
      await db.staff.clear()
      const roster: TillStaff[] = body.staff.map((s) => {
        const prev = old.get(s.id)
        const samePin = prev?.pin_hash === s.pin_hash
        return {
          id: s.id, name: s.name, role: s.role, phone: s.phone, branch_id: s.branch_id, is_active: s.is_active,
          pin_hash: s.pin_hash, permissions: s.permissions ?? [],
          failed_attempts: samePin ? (prev?.failed_attempts ?? 0) : 0,
          locked_until: samePin ? (prev?.locked_until ?? null) : null,
        }
      })
      if (roster.length > 0) await db.staff.bulkPut(roster)

      // Tombstones (unknown kinds are ignored).
      const gone = (kind: string) => body.tombstones.filter((t) => t.entity === kind).map((t) => t.id)
      const products = gone("product")
      const packs = gone("product_pack_size")
      const staff = gone("staff_profile")
      await deleteProducts(db, products)
      if (packs.length) await db.packs.bulkDelete(packs)
      if (staff.length) await db.staff.bulkDelete(staff)
      counts.deleted += products.length + packs.length + staff.length

      // Stock is always the full branch picture: replace it, minus what this
      // till sold but hasn't uploaded yet.
      await db.products.toCollection().modify((p) => {
        const s = ctx.stockMap.get(p.id)
        p.stock_on_hand = localStock(s?.qty, pending.get(p.id))
        p.earliest_expiry = s?.expiry ?? null
      })

      // Allowances: replace when the server sent them, minus unsynced sales.
      if (body.allocation) {
        await db.allowances.clear()
        const until = body.allocation.reserved_until
        await db.allowances.bulkPut(allowanceRows(body.allocation.items, pending).map(([product_id, quantity]) => ({ product_id, quantity, reserved_until: until })))
      } else if (ctx.refreshedAllocation) {
        await db.allowances.clear()
      } else {
        // Nothing held server-side any more: drop allowances whose reservation lapsed.
        await db.allowances.filter((a) => a.reserved_until != null && a.reserved_until < body.server_time).delete()
      }

      if (body.device) {
        const prev = await getMeta("device", db)
        await setMeta("device", {
          id: body.device.id, name: body.device.name, code: body.device.code, branchId: body.device.branch_id,
          branchName: body.branch?.name ?? prev?.branchName ?? null,
          organizationId: body.organization?.id ?? prev?.organizationId ?? null,
          organizationName: body.organization?.name ?? prev?.organizationName ?? null,
        }, db)
      }
      if (body.branch) await setMeta("branch", body.branch, db)
    }

    // Full download, last page: anything local the server didn't send is gone.
    if (ctx.last) {
      if (ctx.seenProducts) {
        const seen = ctx.seenProducts
        const stale = (await db.products.toCollection().primaryKeys()).filter((id) => !seen.has(id))
        await deleteProducts(db, stale)
        counts.deleted += stale.length
      }
      if (ctx.seenPacks) {
        const seen = ctx.seenPacks
        await db.packs.filter((p) => !seen.has(p.id)).delete()
      }
    }
  })

  return counts
}
