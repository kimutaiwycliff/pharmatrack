import { sqlite } from "../../db/database"
import { kvSetSync } from "../kv"
import { getDeviceInfo, saveDeviceInfo } from "./device"

// Applies one page of GET /api/sync/pull (apps/web/lib/sync/pull.ts) in ONE
// SQLite transaction. Products page by (updated_at, id); everything else
// (pack sizes, categories, roster, tombstones, stock, allocation) arrives on
// the first page only, so those are applied only when `first` is true — a
// later page's empty staff[] must never wipe the roster.

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
  /** unsynced sale quantities — the server's stock/allowance doesn't include them yet */
  pending: Map<string, number>
  /** first page's stock, kept for products that arrive on later pages */
  stockMap: Map<string, { qty: number; expiry: string | null }>
  /** full download: ids seen across pages, so stale local rows can be dropped at the end */
  seenProducts: Set<string> | null
  seenPacks: Set<string> | null
  seenCategories: Set<string> | null
}

export interface PageCounts {
  products: number
  deleted: number
}

const b = (v: boolean) => (v ? 1 : 0)

function deleteMissing(table: string, idCol: string, keep: Set<string>): number {
  const ids = sqlite.getAllSync<{ id: string }>(`SELECT ${idCol} AS id FROM ${table}`).map((r) => r.id).filter((id) => !keep.has(id))
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500)
    sqlite.runSync(`DELETE FROM ${table} WHERE ${idCol} IN (${chunk.map(() => "?").join(",")})`, chunk)
  }
  return ids.length
}

function deleteProduct(id: string) {
  sqlite.runSync("DELETE FROM products WHERE product_id = ?", [id])
  sqlite.runSync("DELETE FROM product_pack_sizes WHERE product_id = ?", [id])
  sqlite.runSync("DELETE FROM allowances WHERE product_id = ?", [id])
}

export function applyPullPage(body: PullResponse, ctx: PullContext): PageCounts {
  const counts: PageCounts = { products: 0, deleted: 0 }
  const now = Date.now()

  sqlite.withTransactionSync(() => {
    if (ctx.first) {
      ctx.stockMap.clear()
      for (const s of body.stock) ctx.stockMap.set(s.product_id, { qty: s.stock_on_hand, expiry: s.earliest_expiry })
    }
    const stockFor = (id: string) => Math.max(0, (ctx.stockMap.get(id)?.qty ?? 0) - (ctx.pending.get(id) ?? 0))

    // ── Products (every page). Upsert never touches the stock columns of an
    // existing row; the full stock replace below owns those.
    const upsert = sqlite.prepareSync(`
      INSERT INTO products (product_id, name, brand_name, generic_name, strength, dosage_form, base_unit, pack_label,
        units_per_pack, selling_price, cost_price, reorder_level, is_controlled, requires_prescription, gtin, barcode_raw,
        category_id, is_active, image_url, max_discount_percent, catalog_id, stock_on_hand, earliest_expiry, batch_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 0)
      ON CONFLICT(product_id) DO UPDATE SET
        name = excluded.name, brand_name = excluded.brand_name, generic_name = excluded.generic_name,
        strength = excluded.strength, dosage_form = excluded.dosage_form, base_unit = excluded.base_unit,
        pack_label = excluded.pack_label, units_per_pack = excluded.units_per_pack, selling_price = excluded.selling_price,
        is_controlled = excluded.is_controlled, requires_prescription = excluded.requires_prescription,
        gtin = excluded.gtin, barcode_raw = excluded.barcode_raw, category_id = excluded.category_id,
        is_active = excluded.is_active, image_url = excluded.image_url, max_discount_percent = excluded.max_discount_percent`)
    try {
      for (const p of body.products) {
        upsert.executeSync([
          p.id, p.name, p.brand_name, p.generic_name, p.strength, p.dosage_form, p.base_unit ?? "unit", p.pack_label,
          p.units_per_pack ?? 1, p.selling_price ?? 0, b(p.is_controlled), b(p.requires_prescription), p.gtin, p.barcode_raw,
          p.category_id, b(p.is_active), p.image_url, p.max_discount_percent, stockFor(p.id), ctx.stockMap.get(p.id)?.expiry ?? null,
        ])
        ctx.seenProducts?.add(p.id)
        counts.products++
      }
    } finally {
      upsert.finalizeSync()
    }

    if (ctx.first) {
      for (const pk of body.pack_sizes) {
        sqlite.runSync(
          `INSERT INTO product_pack_sizes (id, product_id, label, unit_count, selling_price_cents, cost_price_cents, barcode, is_active)
           VALUES (?, ?, ?, ?, ?, NULL, ?, ?)
           ON CONFLICT(id) DO UPDATE SET product_id = excluded.product_id, label = excluded.label, unit_count = excluded.unit_count,
             selling_price_cents = excluded.selling_price_cents, barcode = excluded.barcode, is_active = excluded.is_active`,
          [pk.id, pk.product_id, pk.label, pk.unit_count, Math.round((pk.selling_price ?? 0) * 100), pk.barcode, b(pk.is_active)],
        )
        ctx.seenPacks?.add(pk.id)
      }
      for (const c of body.categories) {
        sqlite.runSync(
          "INSERT INTO categories (id, parent_id, name) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET parent_id = excluded.parent_id, name = excluded.name",
          [c.id, c.parent_id, c.name],
        )
        ctx.seenCategories?.add(c.id)
      }

      // Roster: always the full list for this branch — replace it, keeping
      // each person's lockout counter unless their PIN changed.
      const ids = body.staff.map((s) => s.id)
      if (ids.length === 0) sqlite.runSync("DELETE FROM roster")
      else sqlite.runSync(`DELETE FROM roster WHERE id NOT IN (${ids.map(() => "?").join(",")})`, ids)
      for (const s of body.staff) {
        sqlite.runSync(
          `INSERT INTO roster (id, name, role, phone, branch_id, is_active, pin_hash, permissions, failed_attempts, locked_until, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?)
           ON CONFLICT(id) DO UPDATE SET name = excluded.name, role = excluded.role, phone = excluded.phone,
             branch_id = excluded.branch_id, is_active = excluded.is_active, permissions = excluded.permissions,
             failed_attempts = CASE WHEN roster.pin_hash IS excluded.pin_hash THEN roster.failed_attempts ELSE 0 END,
             locked_until = CASE WHEN roster.pin_hash IS excluded.pin_hash THEN roster.locked_until ELSE NULL END,
             pin_hash = excluded.pin_hash, updated_at = excluded.updated_at`,
          [s.id, s.name, s.role, s.phone, s.branch_id, b(s.is_active), s.pin_hash, JSON.stringify(s.permissions ?? []), now],
        )
      }

      for (const t of body.tombstones) {
        counts.deleted++
        if (t.entity === "product") deleteProduct(t.id)
        else if (t.entity === "product_pack_size") sqlite.runSync("DELETE FROM product_pack_sizes WHERE id = ?", [t.id])
        else if (t.entity === "category") sqlite.runSync("DELETE FROM categories WHERE id = ?", [t.id])
        else if (t.entity === "staff_profile") sqlite.runSync("DELETE FROM roster WHERE id = ?", [t.id])
        else counts.deleted--
      }

      // Stock is always the full branch picture: replace it, minus what this
      // device sold but hasn't uploaded yet.
      sqlite.runSync("UPDATE products SET stock_on_hand = 0, earliest_expiry = NULL")
      for (const [id, s] of ctx.stockMap) {
        sqlite.runSync("UPDATE products SET stock_on_hand = ?, earliest_expiry = ? WHERE product_id = ?", [stockFor(id), s.expiry, id])
      }

      // Allowances: replace when the server sent them. A held (not refreshed)
      // allocation hasn't been reduced by our unsynced sales either.
      if (body.allocation) {
        sqlite.runSync("DELETE FROM allowances")
        for (const a of body.allocation.items) {
          const qty = Math.max(0, a.quantity - (ctx.refreshedAllocation ? 0 : (ctx.pending.get(a.product_id) ?? 0)))
          sqlite.runSync("INSERT INTO allowances (product_id, quantity, reserved_until, updated_at) VALUES (?, ?, ?, ?)", [
            a.product_id, qty, body.allocation.reserved_until, now,
          ])
        }
      } else if (ctx.refreshedAllocation) {
        sqlite.runSync("DELETE FROM allowances")
      } else {
        // Nothing held server-side any more: drop allowances whose reservation lapsed.
        sqlite.runSync("DELETE FROM allowances WHERE reserved_until IS NOT NULL AND reserved_until < ?", [body.server_time])
      }

      if (body.device) {
        const prev = getDeviceInfo()
        saveDeviceInfo({
          id: body.device.id,
          name: body.device.name,
          code: body.device.code,
          branchId: body.device.branch_id,
          branchName: body.branch?.name ?? prev?.branchName ?? null,
          organizationName: body.organization?.name ?? prev?.organizationName ?? null,
        })
      }
      if (body.branch) kvSetSync("sync_branch", body.branch)
    }

    // Full download, last page: anything local the server didn't send is gone.
    if (ctx.last) {
      if (ctx.seenProducts) {
        const stale = sqlite.getAllSync<{ id: string }>("SELECT product_id AS id FROM products").filter((r) => !ctx.seenProducts!.has(r.id))
        for (const r of stale) deleteProduct(r.id)
        counts.deleted += stale.length
      }
      if (ctx.seenPacks) deleteMissing("product_pack_sizes", "id", ctx.seenPacks)
      if (ctx.seenCategories) deleteMissing("categories", "id", ctx.seenCategories)
    }
  })

  return counts
}
