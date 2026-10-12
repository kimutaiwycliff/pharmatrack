import { and, asc, eq, gt, gte, inArray, isNull, sql } from "drizzle-orm"
import {
  withTenant, dbAdmin, shift, sale, sale_item, payment, product, product_batch, product_pack_size, controlled_substance_log,
  staff_profile, role_permission, sync_issue, type DrizzleDB,
} from "@pharmatrack/db"
import { resolvePermissions, type Capability } from "@pharmatrack/core"
import type { DeviceContext } from "./device-auth"
import { consumeAllowance } from "./allocation"
import { isLateSync } from "./time"
import { pushItem, type PushResult, type SaleItem } from "./push-schema"
import { z } from "zod"

// Applies a device's uploaded items in order, each in its own transaction, so
// one bad item never blocks the rest of the day. Sales keep what happened on
// the device — real time of sale, the cashier who made it, the price charged —
// and anything unusual is recorded in the Sync issues inbox, never dropped.

const FUTURE_TOLERANCE_MS = 10 * 60_000

class ItemError extends Error {
  constructor(public status: "rejected" | "retry", public code: string, message: string) { super(message) }
}

// Drizzle wraps driver errors ("Failed query…") with the PostgresError as `cause`.
const pgCode = (e: unknown): string | undefined => {
  if (typeof e !== "object" || e === null) return undefined
  const err = e as { code?: string; cause?: unknown }
  return err.code ?? pgCode(err.cause)
}
const isUnique = (e: unknown) => pgCode(e) === "23505"

async function staffCan(db: DrizzleDB, userId: string, branchId: string, cap: Capability) {
  const [sp] = await db.select({ role: staff_profile.role, branch_id: staff_profile.branch_id, active: staff_profile.is_active })
    .from(staff_profile).where(eq(staff_profile.user_id, userId)).limit(1)
  if (!sp || !sp.active) return false
  if (sp.branch_id && sp.branch_id !== branchId) return false
  const overrides = await db.select({ role: role_permission.role, capability: role_permission.capability, allowed: role_permission.allowed })
    .from(role_permission).where(eq(role_permission.role, sp.role))
  return resolvePermissions(sp.role, overrides).includes(cap)
}

/** variance = closing cash − (float + cash actually collected on the shift). */
export async function recomputeShiftVariance(db: DrizzleDB, shiftId: string) {
  const [s] = await db.select().from(shift).where(eq(shift.id, shiftId)).limit(1)
  if (!s || s.closing_cash == null) return
  const [{ cash }] = (await db.select({ cash: sql<string>`coalesce(sum(${payment.amount}), 0)` }).from(payment)
    .innerJoin(sale, eq(sale.id, payment.sale_id))
    .where(and(eq(sale.shift_id, shiftId), eq(sale.status, "completed"), eq(payment.method, "cash")))) as [{ cash: string }]
  const variance = Number(s.closing_cash) - (Number(s.opening_float) + Number(cash))
  await db.update(shift).set({ variance: variance.toFixed(2) }).where(eq(shift.id, shiftId))
}

async function issue(db: DrizzleDB, ctx: DeviceContext, kind: string, fields: { sale_id?: string; shift_id?: string; product_id?: string; details: Record<string, unknown> }) {
  await db.insert(sync_issue).values({
    organization_id: ctx.organizationId, branch_id: ctx.branchId, device_id: ctx.device.id, kind,
    sale_id: fields.sale_id ?? null, shift_id: fields.shift_id ?? null, product_id: fields.product_id ?? null, details: fields.details,
  })
}

// ── shift_open ───────────────────────────────────────────────────────────────
async function applyShiftOpen(db: DrizzleDB, ctx: DeviceContext, it: Extract<z.infer<typeof pushItem>, { type: "shift_open" }>): Promise<PushResult> {
  const [dupe] = await db.select({ id: shift.id }).from(shift).where(eq(shift.client_id, it.client_id)).limit(1)
  if (dupe) return { client_id: it.client_id, status: "duplicate", server_id: dupe.id }
  if (!(await staffCan(db, it.cashier_id, ctx.branchId, "pos.sell"))) {
    throw new ItemError("rejected", "cashier_invalid", "This staff member can't sell at this branch")
  }
  const openedAt = new Date(Math.min(new Date(it.opened_at).getTime(), Date.now()))
  // One open shift per person: a shift still open elsewhere is closed (with a
  // note) at the moment this one started, and flagged for the manager. It may
  // be at another branch this device can't see under RLS, so look it up with
  // the admin connection — strictly scoped to this org and this person.
  const [open] = await dbAdmin().select().from(shift).where(and(
    eq(shift.organization_id, ctx.organizationId), eq(shift.cashier_id, it.cashier_id), isNull(shift.closed_at),
  )).limit(1)
  const flags: string[] = []
  if (open) {
    await dbAdmin().update(shift).set({
      closed_at: openedAt < open.opened_at ? open.opened_at : openedAt,
      notes: [open.notes, "Auto-closed: the same person opened a shift on a selling device."].filter(Boolean).join("\n"),
    }).where(and(eq(shift.id, open.id), isNull(shift.closed_at)))
    await issue(db, ctx, "shift_conflict", { details: { closed_shift_id: open.id, cashier_id: it.cashier_id, replaced_by_client_id: it.client_id } })
    flags.push("shift_conflict")
  }
  const [row] = await db.insert(shift).values({
    organization_id: ctx.organizationId, branch_id: ctx.branchId, cashier_id: it.cashier_id,
    opening_float: it.opening_float.toFixed(2), opened_at: openedAt, device_id: ctx.device.id, client_id: it.client_id,
  }).returning({ id: shift.id })
  return { client_id: it.client_id, status: "synced", server_id: row!.id, ...(flags.length ? { flags } : {}) }
}

// ── shift_close ──────────────────────────────────────────────────────────────
async function applyShiftClose(db: DrizzleDB, ctx: DeviceContext, it: Extract<z.infer<typeof pushItem>, { type: "shift_close" }>): Promise<PushResult> {
  const [s] = await db.select().from(shift).where(eq(shift.client_id, it.client_id)).limit(1)
  if (!s) throw new ItemError("retry", "shift_unknown", "Shift not synced yet")
  if (s.closed_at && s.closing_cash != null) return { client_id: it.client_id, status: "duplicate", server_id: s.id }
  const closedAt = new Date(Math.max(Math.min(new Date(it.closed_at).getTime(), Date.now()), s.opened_at.getTime()))
  const notes = it.closed_by && it.closed_by !== s.cashier_id
    ? [s.notes, it.notes, "Force-closed on the selling device by a manager."].filter(Boolean).join("\n")
    : [s.notes, it.notes].filter(Boolean).join("\n") || null
  await db.update(shift).set({
    closed_at: closedAt, closing_cash: it.closing_cash == null ? null : it.closing_cash.toFixed(2), notes,
  }).where(eq(shift.id, s.id))
  await recomputeShiftVariance(db, s.id)
  return { client_id: it.client_id, status: "synced", server_id: s.id }
}

// ── override ─────────────────────────────────────────────────────────────────
async function applyOverride(db: DrizzleDB, ctx: DeviceContext, it: Extract<z.infer<typeof pushItem>, { type: "override" }>): Promise<PushResult> {
  const [dupe] = await db.select({ id: sync_issue.id }).from(sync_issue)
    .where(and(eq(sync_issue.kind, "override_used"), sql`${sync_issue.details}->>'client_id' = ${it.client_id}`)).limit(1)
  if (dupe) return { client_id: it.client_id, status: "duplicate", server_id: dupe.id }
  const valid = await staffCan(db, it.manager_id, ctx.branchId, "sync.override")
  await issue(db, ctx, "override_used", { details: { client_id: it.client_id, manager_id: it.manager_id, at: it.at, until: it.until, pending_sales: it.pending_sales, manager_permitted: valid } })
  return { client_id: it.client_id, status: "synced", server_id: it.client_id, ...(valid ? {} : { flags: ["manager_not_permitted"] }) }
}

// ── sale ─────────────────────────────────────────────────────────────────────
async function applySale(db: DrizzleDB, ctx: DeviceContext, it: SaleItem): Promise<PushResult> {
  const [dupe] = await db.select({ id: sale.id }).from(sale).where(eq(sale.offline_reference, it.client_id)).limit(1)
  if (dupe) return { client_id: it.client_id, status: "duplicate", server_id: dupe.id }

  if (!(await staffCan(db, it.cashier_id, ctx.branchId, "pos.sell"))) {
    throw new ItemError("rejected", "cashier_invalid", "The cashier on this sale can't sell at this branch")
  }

  const now = Date.now()
  let soldAt = new Date(it.sold_at)
  const flags: string[] = []
  if (soldAt.getTime() > now + FUTURE_TOLERANCE_MS) { soldAt = new Date(now); flags.push("clock_ahead") }

  let shiftId: string | null = null
  if (it.shift_client_id) {
    const [s] = await db.select({ id: shift.id }).from(shift).where(eq(shift.client_id, it.shift_client_id)).limit(1)
    if (!s) throw new ItemError("retry", "shift_unknown", "The sale's shift hasn't synced yet")
    shiftId = s.id
  }

  // Server prices, to flag (not rewrite) what was actually charged.
  const productIds = [...new Set(it.items.map((i) => i.product_id))]
  const prods = await db.select({ id: product.id, selling_price: product.selling_price, cost_price: product.cost_price })
    .from(product).where(inArray(product.id, productIds))
  const prodMap = new Map(prods.map((p) => [p.id, p]))
  const packIds = it.items.map((i) => i.sell_unit?.pack_size_id).filter((x): x is string => !!x)
  const packs = packIds.length ? await db.select({ id: product_pack_size.id, price: product_pack_size.selling_price, unit_count: product_pack_size.unit_count })
    .from(product_pack_size).where(inArray(product_pack_size.id, packIds)) : []
  const packMap = new Map(packs.map((p) => [p.id, p]))

  const subtotal = Math.round(it.items.reduce((s, i) => s + i.line_total, 0) * 100) / 100
  const total = Math.max(0, Math.round((subtotal - it.discount_amount) * 100) / 100)

  const [saleRow] = await db.insert(sale).values({
    organization_id: ctx.organizationId, branch_id: ctx.branchId, shift_id: shiftId, cashier_id: it.cashier_id,
    receipt_number: it.receipt_number, status: "completed",
    subtotal: subtotal.toFixed(2), discount_amount: it.discount_amount.toFixed(2), tax_amount: "0", total_amount: total.toFixed(2),
    payment_method: it.payment_method, offline_reference: it.client_id,
    amount_tendered: it.amount_tendered != null ? it.amount_tendered.toFixed(2) : null,
    change_given: it.change_given != null ? it.change_given.toFixed(2) : null,
    customer_name: it.customer_name ?? null, customer_phone: it.customer_phone ?? null,
    created_at: soldAt, device_id: ctx.device.id, synced_at: new Date(),
  }).returning({ id: sale.id })
  const saleId = saleRow!.id

  for (const line of it.items) {
    const p = prodMap.get(line.product_id)
    // Price check: what the server would charge per base unit now.
    const pack = line.sell_unit ? packMap.get(line.sell_unit.pack_size_id) : undefined
    const serverUnit = pack ? Number(pack.price) / pack.unit_count : p ? Number(p.selling_price) : null
    if (serverUnit != null && Math.abs(serverUnit - line.unit_price) > 0.01) {
      await issue(db, ctx, "price_mismatch", { sale_id: saleId, product_id: line.product_id, details: {
        product_name: line.product_name, charged_unit_price: line.unit_price, current_unit_price: Math.round(serverUnit * 100) / 100, quantity: line.quantity,
      } })
      if (!flags.includes("price_mismatch")) flags.push("price_mismatch")
    }

    // FEFO decrement. The device only sold within its allowance, so stock is
    // normally there; if a web write-off ate it meanwhile, the shortfall is
    // recorded unallocated and flagged — the sale itself stands.
    const batches = p ? await db.select({ id: product_batch.id, qty: product_batch.quantity_remaining, batch_number: product_batch.batch_number, cost: product_batch.cost_price })
      .from(product_batch)
      .where(and(eq(product_batch.product_id, line.product_id), eq(product_batch.branch_id, ctx.branchId), gt(product_batch.quantity_remaining, 0)))
      .orderBy(asc(product_batch.expiry_date)) : []
    let remaining = line.quantity
    for (const b of batches) {
      if (remaining <= 0) break
      const take = Math.min(remaining, b.qty)
      const [dec] = await db.update(product_batch).set({ quantity_remaining: sql`${product_batch.quantity_remaining} - ${take}` })
        .where(and(eq(product_batch.id, b.id), gte(product_batch.quantity_remaining, take))).returning({ id: product_batch.id })
      if (!dec) continue
      const [si] = await db.insert(sale_item).values({
        sale_id: saleId, product_id: line.product_id, batch_id: b.id, product_name: line.product_name, quantity: take,
        unit_price: line.unit_price.toFixed(2), discount_percent: String(line.discount_percent),
        line_total: (Math.round(line.line_total * (take / line.quantity) * 100) / 100).toFixed(2),
        base_unit: line.base_unit, product_strength: line.product_strength,
        unit_cost: b.cost ?? p?.cost_price ?? null,
      }).returning({ id: sale_item.id })
      if (line.is_controlled && b.batch_number) {
        await db.insert(controlled_substance_log).values({ organization_id: ctx.organizationId, sale_item_id: si!.id, quantity: take, batch_number: b.batch_number })
      }
      remaining -= take
    }
    if (remaining > 0) {
      await db.insert(sale_item).values({
        sale_id: saleId, product_id: p ? line.product_id : null, batch_id: null, product_name: line.product_name, quantity: remaining,
        unit_price: line.unit_price.toFixed(2), discount_percent: String(line.discount_percent),
        line_total: (Math.round(line.line_total * (remaining / line.quantity) * 100) / 100).toFixed(2),
        base_unit: line.base_unit, product_strength: line.product_strength, unit_cost: p?.cost_price ?? null,
      })
      await issue(db, ctx, "oversell", { sale_id: saleId, product_id: p ? line.product_id : undefined, details: {
        product_name: line.product_name, sold: line.quantity, unbacked: remaining, reason: p ? "stock_removed_while_offline" : "product_deleted",
      } })
      if (!flags.includes("oversell")) flags.push("oversell")
    }
    await consumeAllowance(db, ctx.device.id, line.product_id, line.quantity)
  }

  // Payments: split records each method separately so shift cash is right.
  const pays: Array<typeof payment.$inferInsert> = []
  if (it.payment_method === "split") {
    const cash = it.cash_amount ?? 0
    const mpesa = it.mpesa_amount ?? Math.max(0, total - cash)
    if (cash > 0) pays.push({ sale_id: saleId, method: "cash", amount: cash.toFixed(2) })
    if (mpesa > 0) pays.push({ sale_id: saleId, method: "mpesa", amount: mpesa.toFixed(2), mpesa_receipt: it.mpesa_reference ?? null })
  } else {
    pays.push({ sale_id: saleId, method: it.payment_method, amount: total.toFixed(2), mpesa_receipt: it.mpesa_reference ?? null })
  }
  await db.insert(payment).values(pays)

  if (it.payment_method !== "cash" && !it.mpesa_verified) {
    await issue(db, ctx, "mpesa_unverified", { sale_id: saleId, details: { reference: it.mpesa_reference ?? null, amount: it.mpesa_amount ?? total, receipt_number: it.receipt_number } })
    flags.push("mpesa_unverified")
  }
  if (isLateSync(soldAt)) {
    await issue(db, ctx, "late_sync", { sale_id: saleId, details: { receipt_number: it.receipt_number, sold_at: soldAt.toISOString(), override_client_id: it.override_client_id ?? null } })
    flags.push("late_sync")
  }
  // A shift closed before this sale arrived gets its variance corrected.
  if (shiftId) await recomputeShiftVariance(db, shiftId)

  return { client_id: it.client_id, status: "synced", server_id: saleId, ...(flags.length ? { flags } : {}) }
}

/** Record a rejected sale in the inbox with its full payload, so nothing is lost. */
async function parkRejectedSale(ctx: DeviceContext, raw: unknown, code: string, message: string) {
  try {
    await withTenant(ctx.tenant, (db) => issue(db, ctx, "rejected_sale", { details: { code, message, payload: raw as Record<string, unknown> } }))
  } catch { /* the device keeps it in Needs attention regardless */ }
}

export async function processPush(ctx: DeviceContext, rawItems: unknown[]): Promise<PushResult[]> {
  const results: PushResult[] = []
  for (const raw of rawItems) {
    const parsed = pushItem.safeParse(raw)
    const clientId = typeof raw === "object" && raw && "client_id" in raw ? String((raw as { client_id: unknown }).client_id) : "unknown"
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Invalid item"
      if (typeof raw === "object" && raw && (raw as { type?: string }).type === "sale") await parkRejectedSale(ctx, raw, "invalid", message)
      results.push({ client_id: clientId, status: "rejected", code: "invalid", message })
      continue
    }
    const it = parsed.data
    try {
      const r = await withTenant(ctx.tenant, (db) => {
        switch (it.type) {
          case "shift_open": return applyShiftOpen(db, ctx, it)
          case "shift_close": return applyShiftClose(db, ctx, it)
          case "override": return applyOverride(db, ctx, it)
          case "sale": return applySale(db, ctx, it)
        }
      })
      results.push(r)
    } catch (err) {
      if (err instanceof ItemError) {
        if (err.status === "rejected" && it.type === "sale") await parkRejectedSale(ctx, raw, err.code, err.message)
        results.push({ client_id: it.client_id, status: err.status, code: err.code, message: err.message })
      } else if (isUnique(err)) {
        // Raced with another upload of the same item.
        results.push({ client_id: it.client_id, status: "duplicate", server_id: null })
      } else {
        console.error("[sync/push] item failed", it.type, it.client_id, err)
        results.push({ client_id: it.client_id, status: "retry", code: "server_error", message: "Server error — will retry" })
      }
    }
  }
  return results
}
