import { create } from "zustand"
import { apiFetch } from "../lib/api-fetch"
import { kvGet, kvSet, kvDelete } from "../lib/kv"

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
  clockIn: (openingFloat: number, branchId: string) => Promise<void>
  clockOut: (closingCash: number, notes?: string) => Promise<{ shift: ShiftResponse; variance: number | null } | null>
}

function toActiveShift(shift: ShiftResponse): ActiveShift {
  return { id: shift.id, openingFloat: shift.opening_float, clockedInAt: shift.clocked_in_at }
}

// Populates from GET /api/shifts/active, POST /api/shifts (clock-in), and
// PATCH /api/shifts (clock-out) — apps/web/app/api/shifts/{active/,}route.ts,
// both verified working with no server changes needed. Surfaces failures
// (network error, non-2xx, unparseable body) as `error` instead of leaving
// the caller stuck, mirroring the session store's pattern (src/store/session.ts).
// loadActiveShift falls back to the last-known shift cached in local SQLite
// (kv.ts) on failure, so POS's "clock in before taking sales" gate doesn't
// fire just because the network dropped mid-shift — clock-in/out themselves
// still require a live request since shift state is server-authoritative.
export const useShiftStore = create<ShiftState>((set, get) => ({
  activeShift: null,
  loaded: false,
  error: null,
  stale: false,
  async loadActiveShift() {
    set({ error: null })
    try {
      const res = await apiFetch("/api/shifts/active")
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as { shift: ShiftResponse | null; cashSales: number }
      const active = data.shift ? toActiveShift(data.shift) : null
      set({ activeShift: active, loaded: true, stale: false })
      if (active) await kvSet(CACHE_KEY, active)
      else await kvDelete(CACHE_KEY)
    } catch {
      const cached = await kvGet<ActiveShift>(CACHE_KEY)
      if (cached) {
        set({ activeShift: cached, loaded: true, stale: true, error: "Offline — showing last known shift" })
      } else {
        set({ error: "Could not reach the server. Check your connection and try again." })
      }
    }
  },
  async clockIn(openingFloat, branchId) {
    set({ error: null })
    try {
      const res = await apiFetch("/api/shifts", {
        method: "POST",
        body: JSON.stringify({ branch_id: branchId, opening_float: openingFloat }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        set({ error: (body as { error?: string }).error ?? `Could not clock in (HTTP ${res.status})` })
        return
      }
      const data = (await res.json()) as { shift: ShiftResponse }
      const active = toActiveShift(data.shift)
      set({ activeShift: active, stale: false })
      await kvSet(CACHE_KEY, active)
    } catch {
      set({ error: "Could not reach the server. Check your connection and try again." })
    }
  },
  async clockOut(closingCash, notes) {
    set({ error: null })
    const active = get().activeShift
    if (!active) {
      set({ error: "No active shift to clock out of" })
      return null
    }
    try {
      const res = await apiFetch("/api/shifts", {
        method: "PATCH",
        body: JSON.stringify({ shift_id: active.id, closing_cash: closingCash, notes }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        set({ error: (body as { error?: string }).error ?? `Could not clock out (HTTP ${res.status})` })
        return null
      }
      const data = (await res.json()) as { shift: ShiftResponse }
      set({ activeShift: null })
      await kvDelete(CACHE_KEY)
      return { shift: data.shift, variance: data.shift.variance }
    } catch {
      set({ error: "Could not reach the server. Check your connection and try again." })
      return null
    }
  },
}))
