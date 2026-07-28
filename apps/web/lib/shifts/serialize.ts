import type { shift } from "@pharmatrack/db"

type ShiftRow = typeof shift.$inferSelect

// The new `shift` schema renamed columns (cashier_id, opened_at, closed_at) but
// the UI + @pharmatrack/types Shift still use the old names. Map back here so the
// frontend stays untouched.
export function serializeShift(row: ShiftRow) {
  return {
    id: row.id,
    branch_id: row.branch_id,
    staff_id: row.cashier_id,
    opening_float: Number(row.opening_float),
    closing_cash: row.closing_cash == null ? null : Number(row.closing_cash),
    variance: row.variance == null ? null : Number(row.variance),
    clocked_in_at: row.opened_at,
    clocked_out_at: row.closed_at,
    notes: row.notes,
    created_at: row.opened_at,
  }
}
