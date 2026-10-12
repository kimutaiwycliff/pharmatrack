import { apiJson, withQuery } from "../../lib/api"
import type { Page } from "../../hooks/useQuery"

// R3: the online shift endpoints, typed from apps/web/app/api/shifts/route.ts
// (GET list + PATCH clock-out/force-close) and apps/web/app/api/shifts/[id]/
// route.ts (GET one). Money fields are decimal KES numbers.

export interface ShiftListRow {
  id: string
  branch_id: string
  staff_id: string
  opening_float: number
  closing_cash: number | null
  variance: number | null
  clocked_in_at: string
  clocked_out_at: string | null
  notes: string | null
  branch_name: string | null
  profiles: { full_name: string; role: string }
  sale_count: number
  total_sales: number
  cash_sales: number
  mpesa_sales: number
}

export interface ShiftDetail extends Omit<ShiftListRow, "branch_name"> {
  /** Sales whose sale.payment_method is "split" (their cash part is in cash_sales). */
  split_sales: number
}

interface ShiftListResponse {
  shifts: ShiftListRow[]
  total: number
  page: number
  limit: number
}

export const SHIFTS_PAGE_SIZE = 20

export async function fetchShiftsPage(page: number, branchId: string | undefined, limit = SHIFTS_PAGE_SIZE): Promise<Page<ShiftListRow>> {
  const res = await apiJson<ShiftListResponse>(withQuery("/api/shifts", { branch_id: branchId, page, limit }))
  return { items: res.shifts, total: res.total }
}

export async function fetchShift(id: string): Promise<ShiftDetail> {
  const res = await apiJson<{ shift: ShiftDetail }>(`/api/shifts/${encodeURIComponent(id)}`)
  return res.shift
}

/**
 * Close someone else's open shift (shifts.close_others). closing_cash is
 * optional here — without it the server records no variance — and the server
 * appends "Force-closed by <name>" to the notes and writes an audit row.
 */
export async function forceCloseShift(args: { shiftId: string; closingCashCents: number | null; notes: string }): Promise<void> {
  const notes = args.notes.trim()
  await apiJson("/api/shifts", {
    method: "PATCH",
    body: {
      shift_id: args.shiftId,
      ...(args.closingCashCents != null ? { closing_cash: args.closingCashCents / 100 } : {}),
      ...(notes ? { notes } : {}),
    },
  })
}
