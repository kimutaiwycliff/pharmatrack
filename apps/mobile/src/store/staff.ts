import { create } from "zustand"
import { kvGetSync, kvSetSync, kvDeleteSync } from "../lib/kv"

// Who is selling on this till right now (R1 rule 6). Set by an online
// sign-in (lib/sync/staff-session.ts) or an offline roster PIN switch
// (lib/sync/roster.ts); it's the cashier_id on every sale and local shift.
// No cookie is needed to sell — just this + a registered device.

export interface CurrentStaff {
  id: string
  name: string
  role: string
  permissions: string[]
}

const KEY = "current_staff"

interface StaffState {
  current: CurrentStaff | null
  loaded: boolean
  load: () => void
  setCurrent: (staff: CurrentStaff) => void
  clear: () => void
}

export const useStaffStore = create<StaffState>((set) => ({
  current: null,
  loaded: false,
  load() {
    set({ current: kvGetSync<CurrentStaff>(KEY), loaded: true })
  },
  setCurrent(staff) {
    kvSetSync(KEY, staff)
    set({ current: staff, loaded: true })
  },
  clear() {
    kvDeleteSync(KEY)
    set({ current: null, loaded: true })
  },
}))

export function staffCan(staff: CurrentStaff | null | undefined, capability: string): boolean {
  return !!staff && staff.permissions.includes(capability)
}
