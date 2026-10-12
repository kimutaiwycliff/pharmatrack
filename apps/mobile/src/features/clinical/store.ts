import { create } from "zustand"

// Set by the booking / prescription forms after a save so the list screen
// they return to reloads on focus (expo-router keeps the list mounted).
interface ClinicalDirty {
  appointments: boolean
  prescriptions: boolean
  mark: (which: "appointments" | "prescriptions") => void
  /** Returns whether it was dirty, and clears it. */
  take: (which: "appointments" | "prescriptions") => boolean
}

export const useClinicalDirty = create<ClinicalDirty>((set, get) => ({
  appointments: false,
  prescriptions: false,
  mark: (which) => set({ [which]: true } as Pick<ClinicalDirty, typeof which>),
  take: (which) => {
    const was = get()[which]
    if (was) set({ [which]: false } as Pick<ClinicalDirty, typeof which>)
    return was
  },
}))
