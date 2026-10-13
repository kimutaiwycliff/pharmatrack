import { create } from "zustand"
import { kvGet, kvSet, kvDelete } from "../lib/kv"
import { env } from "../lib/env"
import { errorMessage } from "../lib/api"
import { getCurrentStaffId } from "../lib/local-auth"
import { getActiveLocalShift, clockInLocal, clockOutLocal } from "../repo/sales"
import { closeShift, getOpenShiftFor, getShift, openShift } from "../lib/sync/shifts"
import { useStaffStore } from "./staff"
import type { LocalShiftRow } from "../db/schema"

const CACHE_KEY = "active_shift"

// Mirrors apps/web/lib/shifts/serialize.ts's serializeShift() field names
// exactly (verified against that file directly, not from memory) — the DB
// column names differ (cashier_id/opened_at/closed_at) but the serialized
// API shape uses these.
export interface ShiftResponse {
  id: string
  branch_id: string
  staff_id: string
  opening_float: number
  closing_cash: number | null
  variance: number | null
  clocked_in_at: string
  clocked_out_at: string | null
  notes: string | null
  created_at: string
}

interface ActiveShift {
  id: string
  openingFloat: number
  clockedInAt: string
}

interface ShiftState {
  activeShift: ActiveShift | null
  loaded: boolean
  error: string | null
  stale: boolean
  loadActiveShift: () => Promise<void>
  /** Resolves true once the shift is open; on failure `error` says why. Never rejects. */
  clockIn: (openingFloat: number, branchId: string) => Promise<boolean>
  /** Null on failure (with `error` set). Never rejects. */
  clockOut: (closingCash: number, notes?: string) => Promise<{ shift: ShiftResponse; variance: number | null } | null>
  // Used when switching the active till user offline (src/lib/device-users.ts)
  // — the incoming cashier's shift is unknown until back online, so this
  // clears both the in-memory state and the cached kv row rather than
  // leaving the previous cashier's shift visible under the new identity.
  resetShift: () => Promise<void>
  // R1: a manager with shifts.close_others ends someone else's open shift on
  // this phone (no cash count — the server records it as force-closed).
  forceCloseShift: (clientId: string) => Promise<boolean>
}

function fromLocal(row: LocalShiftRow): ActiveShift {
  return { id: row.clientId, openingFloat: row.openingFloatCents / 100, clockedInAt: new Date(row.openedAt).toISOString() }
}

function localToResponse(row: LocalShiftRow, varianceCents: number | null): ShiftResponse {
  const opened = new Date(row.openedAt).toISOString()
  return {
    id: row.clientId,
    branch_id: "",
    staff_id: row.cashierId,
    opening_float: row.openingFloatCents / 100,
    closing_cash: row.closingCashCents == null ? null : row.closingCashCents / 100,
    variance: varianceCents == null ? null : varianceCents / 100,
    clocked_in_at: opened,
    clocked_out_at: row.closedAt == null ? null : new Date(row.closedAt).toISOString(),
    notes: row.notes,
    created_at: opened,
  }
}

// The kv copy is only a cache of the shift table — failing to write it must
// not turn a successful clock-in/out into an error.
async function cacheActive(active: ActiveShift | null): Promise<void> {
  try {
    if (active) await kvSet(CACHE_KEY, active)
    else await kvDelete(CACHE_KEY)
  } catch {
    // best effort
  }
}

// Readable text only — SQLite/constraint messages never reach the till.
const clockInFailed = (err: unknown) => errorMessage(err, "Couldn't start your shift. Please try again.")
const clockOutFailed = (err: unknown) => errorMessage(err, "Couldn't end your shift. Please try again.")

// ONLINE build (R1 rule 5): shifts are device-local (lib/sync/shifts.ts) and
// upload through the sync outbox as shift_open/shift_close, so clock-in and
// clock-out work with no connection — the shift belongs to the current staff
// member (store/staff.ts), whoever signed in or PIN-switched on this phone.
// OFFLINE EDITION (ADR-014): the `shifts` table in repo/sales.ts, unchanged.
export const useShiftStore = create<ShiftState>((set, get) => ({
  activeShift: null,
  loaded: false,
  error: null,
  stale: false,
  async loadActiveShift() {
    // One set per load (not error-reset + result): every subscriber re-renders per set.
    try {
      let active: ActiveShift | null = null
      if (env.EXPO_PUBLIC_OFFLINE_MODE) {
        // Re-derive from the local table (source of truth) rather than trusting
        // the kv cache alone — a prior clock-out elsewhere must be reflected.
        const staffId = await getCurrentStaffId()
        const branch = await kvGet<{ branchId: string | null }>("session")
        if (!staffId || !branch?.branchId) {
          // No staff/branch yet: nothing cached to reconcile.
          set({ activeShift: null, loaded: true, stale: false, error: null })
          return
        }
        const row = await getActiveLocalShift(branch.branchId, staffId)
        active = row ? { id: row.id, openingFloat: row.openingFloatCents / 100, clockedInAt: new Date(row.openedAt).toISOString() } : null
      } else {
        const current = useStaffStore.getState().current
        const row = current ? getOpenShiftFor(current.id) : null
        active = row ? fromLocal(row) : null
      }
      set({ activeShift: active, loaded: true, stale: false, error: null })
      await cacheActive(active)
    } catch (err) {
      set({ error: errorMessage(err, "Couldn't load your shift. Please try again.") })
    }
  },
  async clockIn(openingFloat, branchId) {
    set({ error: null })
    if (env.EXPO_PUBLIC_OFFLINE_MODE) {
      try {
        const staffId = (await getCurrentStaffId()) ?? "unknown"
        const { id } = await clockInLocal(branchId, staffId, Math.round(openingFloat * 100))
        const active = { id, openingFloat, clockedInAt: new Date().toISOString() }
        set({ activeShift: active, stale: false })
        await cacheActive(active)
        return true
      } catch (err) {
        set({ error: clockInFailed(err) })
        return false
      }
    }
    const current = useStaffStore.getState().current
    if (!current) {
      set({ error: "Choose who is selling first" })
      return false
    }
    try {
      const row = openShift({ cashierId: current.id, cashierName: current.name, openingFloatCents: Math.round(openingFloat * 100) })
      const active = fromLocal(row)
      set({ activeShift: active, stale: false })
      await cacheActive(active)
      return true
    } catch (err) {
      set({ error: clockInFailed(err) })
      return false
    }
  },
  async clockOut(closingCash, notes) {
    set({ error: null })
    const active = get().activeShift
    if (!active) {
      set({ error: "No active shift to clock out of" })
      return null
    }
    if (env.EXPO_PUBLIC_OFFLINE_MODE) {
      try {
        const { varianceCents } = await clockOutLocal(active.id, Math.round(closingCash * 100), notes ?? null)
        set({ activeShift: null })
        await cacheActive(null)
        return {
          shift: {
            id: active.id, branch_id: "", staff_id: "", opening_float: active.openingFloat,
            closing_cash: closingCash, variance: varianceCents / 100, clocked_in_at: active.clockedInAt,
            clocked_out_at: new Date().toISOString(), notes: notes ?? null, created_at: active.clockedInAt,
          },
          variance: varianceCents / 100,
        }
      } catch (err) {
        set({ error: clockOutFailed(err) })
        return null
      }
    }
    try {
      const { shift, varianceCents } = closeShift({ clientId: active.id, closingCashCents: Math.round(closingCash * 100), notes: notes ?? null })
      set({ activeShift: null })
      await cacheActive(null)
      return { shift: localToResponse(shift, varianceCents), variance: varianceCents == null ? null : varianceCents / 100 }
    } catch (err) {
      set({ error: clockOutFailed(err) })
      return null
    }
  },
  async resetShift() {
    set({ activeShift: null, loaded: false, error: null, stale: false })
    await kvDelete(CACHE_KEY)
  },
  async forceCloseShift(clientId) {
    const current = useStaffStore.getState().current
    const target = getShift(clientId)
    if (!current || !target) return false
    try {
      closeShift({ clientId, closingCashCents: null, notes: `Force-closed on this phone by ${current.name}`, closedBy: current.id })
      if (get().activeShift?.id === clientId) set({ activeShift: null })
      return true
    } catch (err) {
      set({ error: errorMessage(err, "Couldn't close that shift. Please try again.") })
      return false
    }
  },
}))
