"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"

interface UIStore {
  sidebarCollapsed: boolean
  /** Transient: mobile off-canvas nav drawer open state (not persisted) */
  mobileNavOpen: boolean
  activeBranchId: string | null
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
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
      setMobileNavOpen: (v) => set({ mobileNavOpen: v }),
      setActiveBranch: (id) => set({ activeBranchId: id }),
    }),
    {
      name: "pt-ui",
      // Don't persist the transient drawer state — it should always start closed.
      partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed, activeBranchId: s.activeBranchId }),
    },
  ),
)
