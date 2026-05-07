"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"

interface UIStore {
  sidebarCollapsed: boolean
  activeBranchId: string | null
  toggleSidebar: () => void
  setSidebarCollapsed: (v: boolean) => void
  setActiveBranch: (id: string | null) => void
}

export const useUIStore = create<UIStore>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      activeBranchId: null,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
      setActiveBranch: (id) => set({ activeBranchId: id }),
    }),
    { name: "pt-ui" },
  ),
)
