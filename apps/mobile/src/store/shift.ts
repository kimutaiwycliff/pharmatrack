import { create } from "zustand"
import { apiFetch } from "../lib/api-fetch"

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
export const useShiftStore = create<ShiftState>((set, get) => ({
  activeShift: null,
  loaded: false,
  error: null,
  async loadActiveShift() {
    set({ error: null })
    try {
      const res = await apiFetch("/api/shifts/active")
      if (!res.ok) {
        set({ error: `Could not load shift status (HTTP ${res.status})` })
        return
      }
      const data = (await res.json()) as { shift: ShiftResponse | null; cashSales: number }
      set({ activeShift: data.shift ? toActiveShift(data.shift) : null, loaded: true })
    } catch {
      set({ error: "Could not reach the server. Check your connection and try again." })
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
      set({ activeShift: toActiveShift(data.shift) })
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
      return { shift: data.shift, variance: data.shift.variance }
    } catch {
      set({ error: "Could not reach the server. Check your connection and try again." })
      return null
    }
  },
}))
