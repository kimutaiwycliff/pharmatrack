"use client"

import { formatKES } from "@pharmatrack/core"
import { tillDB, type TillShift } from "./db"
import { enqueue } from "./outbox"
import { openShiftFor } from "./staff"

// Till sessions on a registered computer live in IndexedDB (client_id
// "sh-<uuid>") and upload as shift_open / shift_close outbox items, so
// clock-in/out works with no connection at all. The variance shown here comes
// from the cash this till's sales collected (added in commit-sale.ts); the
// server recomputes its own authoritative variance once everything synced.

export class ShiftError extends Error {}

export async function openShift(args: { cashierId: string; cashierName: string; openingFloatCents: number }): Promise<TillShift> {
  if (!Number.isInteger(args.openingFloatCents) || args.openingFloatCents < 0) throw new ShiftError("Enter a valid opening float (0 or more)")
  const db = tillDB()
  const clientId = `sh-${crypto.randomUUID()}`
  const now = Date.now()
  const row: TillShift = {
    client_id: clientId, cashier_id: args.cashierId, cashier_name: args.cashierName, opened_at: now,
    opening_float_cents: args.openingFloatCents, cash_sales_cents: 0, sales_count: 0,
    closed_at: null, closing_cash_cents: null, notes: null, closed_by: null, open: 1,
  }
  await db.transaction("rw", db.shifts, db.outbox, async () => {
    if (await openShiftFor(args.cashierId)) throw new ShiftError("You already have an open shift on this computer.")
    await db.shifts.add(row)
    await enqueue(clientId, {
      type: "shift_open", client_id: clientId, cashier_id: args.cashierId,
      opened_at: new Date(now).toISOString(), opening_float: args.openingFloatCents / 100,
    }, `Shift opened · ${args.cashierName} · float ${formatKES(args.openingFloatCents)}`, db)
  })
  return row
}

export interface CloseShiftResult {
  shift: TillShift
  /** closing − (float + cash collected); null when no cash count was given */
  varianceCents: number | null
}

export async function closeShift(args: { clientId: string; closingCashCents: number | null; notes: string | null; closedBy?: string }): Promise<CloseShiftResult> {
  const db = tillDB()
  const now = Date.now()
  let closed: TillShift | null = null
  await db.transaction("rw", db.shifts, db.outbox, async () => {
    const s = await db.shifts.get(args.clientId)
    if (!s) throw new ShiftError("Shift not found on this computer.")
    if (s.open !== 1) throw new ShiftError("This shift is already closed.")
    closed = { ...s, closed_at: now, closing_cash_cents: args.closingCashCents, notes: args.notes, closed_by: args.closedBy ?? null, open: 0 }
    await db.shifts.put(closed)
    // Outbox rows are keyed uniquely; the payload carries the shift's client_id.
    await enqueue(`${args.clientId}:close`, {
      type: "shift_close", client_id: args.clientId, closed_at: new Date(now).toISOString(),
      closing_cash: args.closingCashCents == null ? null : args.closingCashCents / 100, notes: args.notes,
      ...(args.closedBy ? { closed_by: args.closedBy } : {}),
    }, `Shift closed · ${s.cashier_name}${args.closingCashCents != null ? ` · counted ${formatKES(args.closingCashCents)}` : ""}`, db)
  })
  const shift = closed!
  return { shift, varianceCents: localVarianceCents(shift) }
}

export function expectedCashCents(s: Pick<TillShift, "opening_float_cents" | "cash_sales_cents">): number {
  return s.opening_float_cents + s.cash_sales_cents
}

export function localVarianceCents(s: TillShift): number | null {
  if (s.closing_cash_cents == null) return null
  return s.closing_cash_cents - expectedCashCents(s)
}

export async function listRecentShifts(limit = 30): Promise<TillShift[]> {
  const rows = await tillDB().shifts.toArray()
  return rows.sort((a, b) => b.opened_at - a.opened_at).slice(0, limit)
}
