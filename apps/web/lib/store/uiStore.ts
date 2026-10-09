"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"

interface UIStore {
  sidebarCollapsed: boolean
  /** Transient: mobile off-canvas nav drawer open state (not persisted) */
  mobileNavOpen: boolean
  /** Selected branch. `null` once `branchChosen` is true means "All branches"
   *  (only offered to users with the `branches.all` permission). */
  activeBranchId: string | null
  /** True once a branch (or All) has been picked — distinguishes a deliberate
   *  "All branches" from a first visit that hasn't chosen yet. */
  branchChosen: boolean
  toggleSidebar: () => void
  setSidebarCollapsed: (v: boolean) => void
  setMobileNavOpen: (v: boolean) => void
  setActiveBranch: (id: string | null) => void
}

export const useUIStore = create<UIStore>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      mobileNavOpen: false,
      activeBranchId: null,
      branchChosen: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
      setMobileNavOpen: (v) => set({ mobileNavOpen: v }),
      setActiveBranch: (id) => set({ activeBranchId: id, branchChosen: true }),
    }),
    {
      name: "pt-ui",
      // Don't persist the transient drawer state — it should always start closed.
      partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed, activeBranchId: s.activeBranchId, branchChosen: s.branchChosen }),
    },
  ),
)
