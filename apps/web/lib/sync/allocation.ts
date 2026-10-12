import { and, eq, gt, gte, inArray, isNull, ne, sql } from "drizzle-orm"
import { device, device_stock_allocation, product_batch, sale, type DrizzleDB } from "@pharmatrack/db"
import { reservationExpiry } from "./time"

// Per-device stock allowance: the guarantee that offline devices can't oversell.
//
// For each product, allowances across a branch's devices never exceed the
// branch's real stock. Online web sales may only use what no device holds
// (see reservedByDevices). A device gets ceil(stock × its share), capped by
// what other devices aren't already holding. Its share is its fraction of the
// branch's recent sales (with +1 smoothing so a new device still gets some),
// unless the owner pinned a percentage on the device.

const ACTIVE_DEVICE_DAYS = 7
const SHARE_WINDOW_DAYS = 14

export interface ShareInput {
  /** Recent sale counts per participant; "web" = the browser till. */
  salesByParticipant: Map<string, number>
  me: string
  pinnedPercent: number | null
}

export function shareFor({ salesByParticipant, me, pinnedPercent }: ShareInput): number {
  if (pinnedPercent != null) return Math.min(1, Math.max(0, pinnedPercent / 100))
  if (!salesByParticipant.has(me)) salesByParticipant.set(me, 0)
  if (salesByParticipant.size === 1) return 1
  let total = 0
  for (const v of salesByParticipant.values()) total += v + 1
  return ((salesByParticipant.get(me) ?? 0) + 1) / total
}

/** quantity this device may hold of a product. */
export function allowanceFor(stock: number, heldByOthers: number, share: number): number {
  const available = Math.max(0, stock - heldByOthers)
  return Math.max(0, Math.min(available, Math.ceil(stock * share)))
}

/** Units of each product held by live device allowances in a branch (optionally excluding one device). */
export async function reservedByDevices(db: DrizzleDB, branchId: string, productIds?: string[], excludeDeviceId?: string) {
  const rows = await db.select({
    product_id: device_stock_allocation.product_id,
    qty: sql<string>`sum(${device_stock_allocation.quantity})`,
  }).from(device_stock_allocation)
    .innerJoin(device, eq(device.id, device_stock_allocation.device_id))
    .where(and(
      eq(device.branch_id, branchId),
      isNull(device.revoked_at),
      gt(device_stock_allocation.reserved_until, sql`now()`),
      productIds && productIds.length > 0 ? inArray(device_stock_allocation.product_id, productIds) : undefined,
      excludeDeviceId ? ne(device.id, excludeDeviceId) : undefined,
    ))
    .groupBy(device_stock_allocation.product_id)
  return new Map(rows.map((r) => [r.product_id, Number(r.qty)]))
}

async function branchStock(db: DrizzleDB, branchId: string, productIds?: string[]) {
  const rows = await db.select({
    product_id: product_batch.product_id,
    qty: sql<string>`sum(${product_batch.quantity_remaining})`,
  }).from(product_batch)
    .where(and(
      eq(product_batch.branch_id, branchId), gt(product_batch.quantity_remaining, 0),
      productIds && productIds.length > 0 ? inArray(product_batch.product_id, productIds) : undefined,
    ))
    .groupBy(product_batch.product_id)
  return new Map(rows.map((r) => [r.product_id, Number(r.qty)]))
}

async function deviceShare(db: DrizzleDB, dev: { id: string; branch_id: string; allocation_percent: string | null }) {
  if (dev.allocation_percent != null) return shareFor({ salesByParticipant: new Map(), me: dev.id, pinnedPercent: Number(dev.allocation_percent) })
  const since = sql`now() - make_interval(days => ${SHARE_WINDOW_DAYS})`
  const active = await db.select({ id: device.id }).from(device)
    .where(and(eq(device.branch_id, dev.branch_id), isNull(device.revoked_at),
      gte(device.last_seen_at, sql`now() - make_interval(days => ${ACTIVE_DEVICE_DAYS})`)))
  const counts = await db.select({
    device_id: sale.device_id, n: sql<string>`count(*)`,
  }).from(sale).where(and(eq(sale.branch_id, dev.branch_id), gte(sale.created_at, since)))
    .groupBy(sale.device_id)
  const participants = new Map<string, number>()
  for (const a of active) participants.set(a.id, 0)
  for (const c of counts) {
    if (c.device_id == null) participants.set("web", Number(c.n)) // browser till competes for stock too
    else if (participants.has(c.device_id)) participants.set(c.device_id, Number(c.n))
  }
  return shareFor({ salesByParticipant: participants, me: dev.id, pinnedPercent: null })
}

/**
 * Replace a device's allowances with a fresh share of current branch stock.
 * Call only when the device has no unsynced sales (otherwise its pending sales
 * would be counted twice). Serialised per branch with an advisory lock.
 */
export async function refreshAllocation(db: DrizzleDB, dev: { id: string; branch_id: string; allocation_percent: string | null }) {
  await db.execute(sql`select pg_advisory_xact_lock(hashtext(${"alloc:" + dev.branch_id}))`)
  await db.delete(device_stock_allocation).where(eq(device_stock_allocation.device_id, dev.id))
  const [stock, held, share] = await Promise.all([
    branchStock(db, dev.branch_id), reservedByDevices(db, dev.branch_id, undefined, dev.id), deviceShare(db, dev),
  ])
  const until = reservationExpiry()
  const rows = [...stock.entries()]
    .map(([product_id, qty]) => ({ product_id, quantity: allowanceFor(qty, held.get(product_id) ?? 0, share) }))
    .filter((r) => r.quantity > 0)
  for (let i = 0; i < rows.length; i += 500) {
    await db.insert(device_stock_allocation).values(rows.slice(i, i + 500).map((r) => ({
      device_id: dev.id, product_id: r.product_id, quantity: r.quantity, reserved_until: until,
    })))
  }
  return { allowances: new Map(rows.map((r) => [r.product_id, r.quantity])), reservedUntil: until, share }
}

/** Grant more of one product to an online device, from stock no-one holds. */
export async function topUpAllocation(db: DrizzleDB, dev: { id: string; branch_id: string }, productId: string, wanted: number) {
  await db.execute(sql`select pg_advisory_xact_lock(hashtext(${"alloc:" + dev.branch_id}))`)
  const [stock, held] = await Promise.all([
    branchStock(db, dev.branch_id, [productId]), reservedByDevices(db, dev.branch_id, [productId]),
  ])
  const free = Math.max(0, (stock.get(productId) ?? 0) - (held.get(productId) ?? 0))
  const grant = Math.min(free, Math.max(0, Math.floor(wanted)))
  const until = reservationExpiry()
  if (grant > 0) {
    await db.insert(device_stock_allocation).values({ device_id: dev.id, product_id: productId, quantity: grant, reserved_until: until })
      .onConflictDoUpdate({
        target: [device_stock_allocation.device_id, device_stock_allocation.product_id],
        set: {
          quantity: sql`case when ${device_stock_allocation.reserved_until} > now() then ${device_stock_allocation.quantity} else 0 end + ${grant}`,
          reserved_until: until, updated_at: sql`now()`,
        },
      })
  }
  const [row] = await db.select({ quantity: device_stock_allocation.quantity }).from(device_stock_allocation)
    .where(and(eq(device_stock_allocation.device_id, dev.id), eq(device_stock_allocation.product_id, productId)))
  return { granted: grant, allowance: row?.quantity ?? 0, reservedUntil: until }
}

/** A synced device sale uses up its allowance. */
export async function consumeAllowance(db: DrizzleDB, deviceId: string, productId: string, qty: number) {
  await db.update(device_stock_allocation)
    .set({ quantity: sql`greatest(0, ${device_stock_allocation.quantity} - ${qty})`, updated_at: sql`now()` })
    .where(and(eq(device_stock_allocation.device_id, deviceId), eq(device_stock_allocation.product_id, productId)))
}
