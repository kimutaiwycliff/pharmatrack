"use client"

import { create } from "zustand"
import type { Profile, Branch } from "@pharmatrack/types"
import type { PlanCode } from "@pharmatrack/core"

interface SessionStore {
  profile: Profile | null
  branches: Branch[]
  planCode: PlanCode | null
  setProfile: (p: Profile) => void
  setBranches: (b: Branch[]) => void
  setPlanCode: (c: PlanCode) => void
}

export const useSessionStore = create<SessionStore>()((set) => ({
  profile: null,
  branches: [],
  planCode: null,
  setProfile: (p) => set({ profile: p }),
  setBranches: (b) => set({ branches: b }),
  setPlanCode: (c) => set({ planCode: c }),
}))
