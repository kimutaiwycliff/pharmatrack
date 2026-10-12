import * as Crypto from "expo-crypto"
import { formatKES } from "@pharmatrack/core"
import { sqlite } from "../../db/database"
import type { LocalShiftRow } from "../../db/schema"
import { enqueue } from "./outbox"

// R1 rule 5 — till sessions live on the device (client_id "sh-<uuid>") and
// upload as shift_open / shift_close outbox items, so clock-in/out works with
// no connection at all. Variance is computed locally from the cash collected
// by this device's sales (accumulated in commit-sale.ts); the server
// recomputes its own authoritative variance once everything has synced.

const SELECT = `SELECT client_id AS clientId, cashier_id AS cashierId, cashier_name AS cashierName, opened_at AS openedAt,
  opening_float_cents AS openingFloatCents, cash_sales_cents AS cashSalesCents, sales_count AS salesCount,
  closed_at AS closedAt, closing_cash_cents AS closingCashCents, notes, closed_by AS closedBy
  FROM local_shifts`

export function getShift(clientId: string): LocalShiftRow | null {
  return sqlite.getFirstSync<LocalShiftRow>(`${SELECT} WHERE client_id = ?`, [clientId])
}

export function getOpenShiftFor(cashierId: string): LocalShiftRow | null {
  return sqlite.getFirstSync<LocalShiftRow>(`${SELECT} WHERE cashier_id = ? AND closed_at IS NULL ORDER BY opened_at DESC LIMIT 1`, [cashierId])
}

export function listOpenShifts(): LocalShiftRow[] {
  return sqlite.getAllSync<LocalShiftRow>(`${SELECT} WHERE closed_at IS NULL ORDER BY opened_at`)
}

export function listRecentShifts(limit = 30): LocalShiftRow[] {
  return sqlite.getAllSync<LocalShiftRow>(`${SELECT} ORDER BY opened_at DESC LIMIT ?`, [limit])
}

export function openShift(args: { cashierId: string; cashierName: string; openingFloatCents: number }): LocalShiftRow {
  const clientId = `sh-${Crypto.randomUUID()}`
  const now = Date.now()
  sqlite.withTransactionSync(() => {
    const existing = getOpenShiftFor(args.cashierId)
    if (existing) throw new Error("You already have an open shift on this phone")
    sqlite.runSync(
      "INSERT INTO local_shifts (client_id, cashier_id, cashier_name, opened_at, opening_float_cents) VALUES (?, ?, ?, ?, ?)",
      [clientId, args.cashierId, args.cashierName, now, args.openingFloatCents],
    )
    enqueue(clientId, {
      type: "shift_open",
      client_id: clientId,
      cashier_id: args.cashierId,
      opened_at: new Date(now).toISOString(),
      opening_float: args.openingFloatCents / 100,
    }, `Shift opened · ${args.cashierName} · float ${formatKES(args.openingFloatCents)}`)
  })
  return getShift(clientId)!
}

export interface CloseShiftResult {
  shift: LocalShiftRow
  /** closing − (float + cash collected); null when no cash count was given */
  varianceCents: number | null
}

export function closeShift(args: { clientId: string; closingCashCents: number | null; notes: string | null; closedBy?: string }): CloseShiftResult {
  const now = Date.now()
  sqlite.withTransactionSync(() => {
    const s = getShift(args.clientId)
    if (!s) throw new Error("Shift not found on this phone")
    if (s.closedAt != null) throw new Error("This shift is already closed")
    sqlite.runSync(
      "UPDATE local_shifts SET closed_at = ?, closing_cash_cents = ?, notes = ?, closed_by = ? WHERE client_id = ?",
      [now, args.closingCashCents, args.notes, args.closedBy ?? null, args.clientId],
    )
    // Outbox rows are keyed uniquely; the payload carries the shift's client_id.
    enqueue(`${args.clientId}:close`, {
      type: "shift_close",
      client_id: args.clientId,
      closed_at: new Date(now).toISOString(),
      closing_cash: args.closingCashCents == null ? null : args.closingCashCents / 100,
      notes: args.notes,
      ...(args.closedBy ? { closed_by: args.closedBy } : {}),
    }, `Shift closed · ${s.cashierName ?? "staff"}${args.closingCashCents != null ? ` · counted ${formatKES(args.closingCashCents)}` : ""}`)
  })
  const shift = getShift(args.clientId)!
  return { shift, varianceCents: localVarianceCents(shift) }
}

export function localVarianceCents(s: LocalShiftRow): number | null {
  if (s.closingCashCents == null) return null
  return s.closingCashCents - (s.openingFloatCents + s.cashSalesCents)
}
