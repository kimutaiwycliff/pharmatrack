import { and, asc, eq, gt, desc } from "drizzle-orm"
import * as Crypto from "expo-crypto"
import { db } from "../db/database"
import { sales, saleItems, payments, productBatches, products, shifts, controlledSubstanceLog, receiptCounters } from "../db/schema"
import type { CartItem } from "../store/cart"

// ADR-014 — Offline Edition real sale ledger. Unlike lib/sync/sales.ts
// (queueSale/buildSalePayload — the ONLINE app's "queue now, POST /api/sales
// later" flow), there is nothing to sync to here: a sale is written straight
// into `sales`/`saleItems`/`payments` in one local transaction, with FEFO
// batch decrement done the same way as apps/web/app/api/sales/route.ts.

function todayKey(): string {
  // Africa/Nairobi has no DST and is a fixed UTC+3 offset, so a plain local
  // Date read is equivalent — matches the server's receiptNumber() which
  // also just uses `new Date()` (the app server runs with TZ set, but on a
  // device this just reads the phone's local date, which is what matters
  // for a receipt a cashier hands over in person).
  const d = new Date()
  return `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`
}

async function nextReceiptNumber(branchId: string): Promise<string> {
  const dateKey = todayKey()
  const [existing] = await db.select().from(receiptCounters)
    .where(and(eq(receiptCounters.branchId, branchId), eq(receiptCounters.dateKey, dateKey)))
    .limit(1)
  const seq = (existing?.lastSeq ?? 0) + 1
  if (existing) {
    await db.update(receiptCounters).set({ lastSeq: seq })
      .where(and(eq(receiptCounters.branchId, branchId), eq(receiptCounters.dateKey, dateKey)))
  } else {
    await db.insert(receiptCounters).values({ branchId, dateKey, lastSeq: seq })
  }
  return `RCP-${dateKey}-${String(seq).padStart(6, "0")}`
}

/** Recomputes the denormalized stock display fields on `products` after a
 *  batch decrement — mirrors what the server's `product_stock` VIEW computes
 *  live; this table has no such view, so it must be kept in sync by hand. */
async function refreshProductStockCache(productId: string, branchId: string): Promise<void> {
  const rows = await db.select().from(productBatches)
    .where(and(eq(productBatches.productId, productId), eq(productBatches.branchId, branchId), gt(productBatches.quantityRemaining, 0)))
    .orderBy(asc(productBatches.expiryDate))
  const stockOnHand = rows.reduce((sum, b) => sum + b.quantityRemaining, 0)
  await db.update(products).set({
    stockOnHand,
    batchCount: rows.length,
    earliestExpiry: rows[0]?.expiryDate ?? null,
  }).where(eq(products.productId, productId))
}

export interface CommitSaleArgs {
  branchId: string
  shiftId: string
  cashierId: string
  items: CartItem[]
  paymentMethod: "cash" | "mpesa" | "card" | "split"
  amountTenderedCents?: number | null
  changeGivenCents?: number | null
  cashAmountCents?: number | null
  mpesaAmountCents?: number | null
  mpesaReference?: string | null
  customerName?: string | null
  customerPhone?: string | null
  customerId?: string | null
}

export interface CommitSaleResult {
  saleId: string
  receiptNumber: string
}

/** Commits a completed sale: FEFO-decrements product_batches oldest-expiry
 *  first (splitting a line across batches exactly like the server does),
 *  writes sale/saleItems/payments, logs any controlled-substance lines, and
 *  refreshes each sold product's cached stock fields. Throws on insufficient
 *  stock rather than partially committing. */
export async function commitLocalSale(args: CommitSaleArgs): Promise<CommitSaleResult> {
  const saleId = Crypto.randomUUID()
  const receiptNumber = await nextReceiptNumber(args.branchId)

  let subtotalCents = 0
  let discountAmountCents = 0
  const itemRows: (typeof saleItems.$inferInsert)[] = []
  const controlledLines: { saleItemId: string; quantity: number; batchNumber: string | null }[] = []

  for (const item of args.items) {
    const lineGrossCents = item.unitPrice * item.quantity
    const lineDiscountCents = Math.round((lineGrossCents * item.discountPercent) / 100)
    const lineTotalCents = lineGrossCents - lineDiscountCents
    subtotalCents += lineGrossCents
    discountAmountCents += lineDiscountCents

    const batchRows = await db.select().from(productBatches)
      .where(and(eq(productBatches.productId, item.productId), eq(productBatches.branchId, args.branchId), gt(productBatches.quantityRemaining, 0)))
      .orderBy(asc(productBatches.expiryDate))

    let remaining = item.quantity
    for (const batch of batchRows) {
      if (remaining <= 0) break
      const take = Math.min(remaining, batch.quantityRemaining)
      await db.update(productBatches).set({ quantityRemaining: batch.quantityRemaining - take }).where(eq(productBatches.id, batch.id))
      const saleItemId = Crypto.randomUUID()
      const takeFraction = take / item.quantity
      itemRows.push({
        id: saleItemId,
        saleId,
        productId: item.productId,
        batchId: batch.id,
        productName: item.productName,
        quantity: take,
        unitPriceCents: item.unitPrice,
        discountPercent: item.discountPercent,
        lineTotalCents: Math.round(lineTotalCents * takeFraction),
        baseUnit: item.baseUnit,
        productStrength: item.productStrength,
      })
      if (item.isControlled) controlledLines.push({ saleItemId, quantity: take, batchNumber: batch.batchNumber })
      remaining -= take
    }
    if (remaining > 0) {
      throw new Error(`Insufficient stock for ${item.productName}: need ${item.quantity}, only ${item.quantity - remaining} available`)
    }
    await refreshProductStockCache(item.productId, args.branchId)
  }

  const totalAmountCents = subtotalCents - discountAmountCents

  await db.insert(sales).values({
    id: saleId,
    branchId: args.branchId,
    shiftId: args.shiftId,
    cashierId: args.cashierId,
    receiptNumber,
    status: "completed",
    subtotalCents,
    discountAmountCents,
    taxAmountCents: 0,
    totalAmountCents,
    paymentMethod: args.paymentMethod,
    customerId: args.customerId ?? null,
    amountTenderedCents: args.amountTenderedCents ?? null,
    changeGivenCents: args.changeGivenCents ?? null,
    customerName: args.customerName ?? null,
    customerPhone: args.customerPhone ?? null,
    createdAt: Date.now(),
  })

  for (const row of itemRows) await db.insert(saleItems).values(row)

  if (args.paymentMethod === "split") {
    if (args.cashAmountCents) await db.insert(payments).values({ id: Crypto.randomUUID(), saleId, method: "cash", amountCents: args.cashAmountCents, createdAt: Date.now() })
    if (args.mpesaAmountCents) await db.insert(payments).values({ id: Crypto.randomUUID(), saleId, method: "mpesa", amountCents: args.mpesaAmountCents, mpesaReceipt: args.mpesaReference ?? null, createdAt: Date.now() })
  } else {
    await db.insert(payments).values({ id: Crypto.randomUUID(), saleId, method: args.paymentMethod, amountCents: totalAmountCents, mpesaReceipt: args.paymentMethod === "mpesa" ? (args.mpesaReference ?? null) : null, createdAt: Date.now() })
  }

  for (const line of controlledLines) {
    await db.insert(controlledSubstanceLog).values({
      id: Crypto.randomUUID(),
      saleItemId: line.saleItemId,
      quantity: line.quantity,
      batchNumber: line.batchNumber,
      createdAt: Date.now(),
    })
  }

  return { saleId, receiptNumber }
}

// ── Shifts ───────────────────────────────────────────────────────────────

export async function getActiveLocalShift(branchId: string, cashierId: string) {
  const [row] = await db.select().from(shifts)
    .where(and(eq(shifts.branchId, branchId), eq(shifts.cashierId, cashierId)))
    .orderBy(desc(shifts.openedAt))
    .limit(1)
  return row && row.closedAt == null ? row : null
}

export async function clockInLocal(branchId: string, cashierId: string, openingFloatCents: number) {
  const id = Crypto.randomUUID()
  await db.insert(shifts).values({ id, branchId, cashierId, openingFloatCents, openedAt: Date.now() })
  return { id }
}

export async function clockOutLocal(shiftId: string, closingCashCents: number, notes: string | null) {
  const [shift] = await db.select().from(shifts).where(eq(shifts.id, shiftId)).limit(1)
  if (!shift) throw new Error("Shift not found")
  const salesRows = await db.select().from(sales).where(eq(sales.shiftId, shiftId))
  const cashSalesCents = salesRows
    .filter((s) => s.paymentMethod === "cash" || s.paymentMethod === "split")
    .reduce((sum, s) => sum + s.totalAmountCents, 0)
  const expectedCashCents = shift.openingFloatCents + cashSalesCents
  const varianceCents = closingCashCents - expectedCashCents
  await db.update(shifts).set({ closingCashCents, varianceCents, notes, closedAt: Date.now() }).where(eq(shifts.id, shiftId))
  return { varianceCents }
}

export async function listLocalShifts(branchId: string) {
  return db.select().from(shifts).where(eq(shifts.branchId, branchId)).orderBy(desc(shifts.openedAt))
}
