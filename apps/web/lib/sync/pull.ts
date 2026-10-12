import { and, asc, eq, gt, gte, isNull, or, sql } from "drizzle-orm"
import {
  product, product_pack_size, category, staff_profile, user, role_permission, sync_tombstone, product_stock,
  device, device_stock_allocation, organization, branch, type DrizzleDB,
} from "@pharmatrack/db"
import { resolvePermissions } from "@pharmatrack/core"
import type { DeviceRow } from "./device-auth"
import { refreshAllocation } from "./allocation"
import { nextNairobiMidnight } from "./time"

// Delta download for a registered device. The cursor is the server time at
// the start of the previous pull (never the device clock), minus a small
// overlap; the app upserts, so re-sent rows are harmless. Products page by
// (updated_at, id) so very large catalogues arrive in chunks.

export const PRODUCT_PAGE = 1000
const OVERLAP_MS = 2000

const n = (v: string | number | null) => (v == null ? null : Number(v))

export interface PullArgs {
  since: Date | null
  /** Keyset position inside a multi-page product download. */
  after: { ts: Date; id: string } | null
  /** True only when the device has no unsynced sales (else its pending sales would be double-counted). */
  refreshAllocation: boolean
}

export async function buildPull(db: DrizzleDB, dev: DeviceRow, args: PullArgs) {
  const [{ now }] = (await db.execute(sql`select now() as now`)) as unknown as [{ now: string }]
  const serverNow = new Date(now)
  const since = args.since ? new Date(args.since.getTime() - OVERLAP_MS) : null

  // ── Products (paged) ──────────────────────────────────────────────────────
  const productRows = await db.select().from(product).where(and(
    since ? gt(product.updated_at, since) : undefined,
    args.after ? or(gt(product.updated_at, args.after.ts), and(eq(product.updated_at, args.after.ts), gt(product.id, args.after.id))) : undefined,
  )).orderBy(asc(product.updated_at), asc(product.id)).limit(PRODUCT_PAGE + 1)
  const hasMore = productRows.length > PRODUCT_PAGE
  const products = productRows.slice(0, PRODUCT_PAGE)
  const last = products[products.length - 1]

  // Everything else is small — send it with the first page only.
  const firstPage = !args.after
  const packs = firstPage
    ? await db.select({ p: product_pack_size }).from(product_pack_size)
        .innerJoin(product, eq(product.id, product_pack_size.product_id))
        .where(since ? gt(product_pack_size.updated_at, since) : undefined)
    : []
  const categories = firstPage ? await db.select().from(category).where(since ? gt(category.updated_at, since) : undefined) : []
  const tombstones = firstPage && since
    ? await db.select({ entity: sync_tombstone.entity, id: sync_tombstone.entity_id }).from(sync_tombstone).where(gte(sync_tombstone.deleted_at, since))
    : []

  // Staff who can sell on this branch's devices — always the full list (small),
  // with the permissions + PIN verifier the app needs for offline PIN switching.
  const staff = firstPage ? await db.select({
    id: staff_profile.user_id, name: user.name, role: staff_profile.role, phone: staff_profile.phone,
    branch_id: staff_profile.branch_id, is_active: staff_profile.is_active, pin_hash: staff_profile.pin_hash,
  }).from(staff_profile).innerJoin(user, eq(user.id, staff_profile.user_id))
    .where(or(isNull(staff_profile.branch_id), eq(staff_profile.branch_id, dev.branch_id))) : []
  const overrides = firstPage ? await db.select({
    role: role_permission.role, capability: role_permission.capability, allowed: role_permission.allowed,
  }).from(role_permission) : []

  // Live stock for the branch — always full (one number per product).
  const stock = firstPage ? await db.select({
    product_id: product_stock.product_id, stock_on_hand: product_stock.stock_on_hand, earliest_expiry: product_stock.earliest_expiry,
  }).from(product_stock).where(eq(product_stock.branch_id, dev.branch_id)) : []

  let allocation: { items: Array<{ product_id: string; quantity: number }>; reserved_until: string; share: number } | null = null
  if (firstPage && args.refreshAllocation) {
    const a = await refreshAllocation(db, dev)
    allocation = { items: [...a.allowances].map(([product_id, quantity]) => ({ product_id, quantity })), reserved_until: a.reservedUntil.toISOString(), share: a.share }
  } else if (firstPage) {
    // Keep what the device already holds (it still has unsynced sales).
    const held = await db.select({ product_id: device_stock_allocation.product_id, quantity: device_stock_allocation.quantity, until: device_stock_allocation.reserved_until })
      .from(device_stock_allocation).where(and(eq(device_stock_allocation.device_id, dev.id), gt(device_stock_allocation.reserved_until, sql`now()`)))
    allocation = held.length > 0
      ? { items: held.map((h) => ({ product_id: h.product_id, quantity: h.quantity })), reserved_until: held[0]!.until.toISOString(), share: NaN }
      : null
  }

  const [org] = firstPage ? await db.select({ name: organization.name }).from(organization).where(eq(organization.id, dev.organization_id)).limit(1) : []
  const [br] = firstPage ? await db.select({ name: branch.name, address: branch.address, phone: branch.phone }).from(branch).where(eq(branch.id, dev.branch_id)).limit(1) : []

  if (firstPage && !hasMore) {
    await db.update(device).set({ last_sync_at: serverNow }).where(eq(device.id, dev.id))
  }

  return {
    server_time: serverNow.toISOString(),
    // The device must sync again before this (Nairobi midnight).
    deadline: nextNairobiMidnight(serverNow).toISOString(),
    // Store this as `since` for the next pull once every page is in.
    cursor: serverNow.toISOString(),
    has_more: hasMore,
    next: hasMore && last ? { ts: last.updated_at.toISOString(), id: last.id } : null,
    full: !args.since,
    device: firstPage ? { id: dev.id, name: dev.name, code: dev.device_code, branch_id: dev.branch_id } : undefined,
    organization: firstPage ? { id: dev.organization_id, name: org?.name ?? null } : undefined,
    branch: firstPage ? { id: dev.branch_id, name: br?.name ?? null, address: br?.address ?? null, phone: br?.phone ?? null } : undefined,
    products: products.map((p) => ({
      id: p.id, name: p.name, brand_name: p.brand_name, generic_name: p.generic_name, strength: p.strength,
      dosage_form: p.dosage_form, base_unit: p.base_unit, pack_label: p.pack_label, units_per_pack: p.units_per_pack,
      selling_price: n(p.selling_price), max_discount_percent: n(p.max_discount_percent),
      gtin: p.gtin, barcode_raw: p.barcode_raw, category_id: p.category_id, image_url: p.image_url,
      is_controlled: p.is_controlled, requires_prescription: p.requires_prescription, is_active: p.is_active,
      updated_at: p.updated_at.toISOString(),
    })),
    pack_sizes: packs.map(({ p }) => ({
      id: p.id, product_id: p.product_id, label: p.label, unit_count: p.unit_count,
      selling_price: n(p.selling_price), barcode: p.barcode, is_active: p.is_active,
    })),
    categories: categories.map((c) => ({ id: c.id, parent_id: c.parent_id, name: c.name })),
    staff: staff.map((s) => ({
      id: s.id, name: s.name, role: s.role, phone: s.phone, branch_id: s.branch_id, is_active: s.is_active,
      // bcrypt hash (the same one PIN login checks server-side) for offline PIN switching.
      pin_hash: s.is_active ? s.pin_hash : null,
      permissions: resolvePermissions(s.role, overrides),
    })),
    tombstones,
    stock: stock.map((s) => ({ product_id: s.product_id, stock_on_hand: s.stock_on_hand ?? 0, earliest_expiry: s.earliest_expiry })),
    allocation,
  }
}

