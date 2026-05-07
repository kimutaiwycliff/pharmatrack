"use client"

import { create } from "zustand"
import type { Profile, Branch } from "@pharmatrack/types"

interface SessionStore {
  profile: Profile | null
  branches: Branch[]
  setProfile: (p: Profile) => void
  setBranches: (b: Branch[]) => void
}

export const useSessionStore = create<SessionStore>()((set) => ({
  profile: null,
  branches: [],
  setProfile: (p) => set({ profile: p }),
  setBranches: (b) => set({ branches: b }),
}))
