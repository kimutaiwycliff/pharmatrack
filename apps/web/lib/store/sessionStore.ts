"use client"

import { create } from "zustand"
import type { Profile, Branch } from "@pharmatrack/types"
import type { PlanCode, Capability } from "@pharmatrack/core"

interface SessionStore {
  profile: Profile | null
  branches: Branch[]
  planCode: PlanCode | null
  /** Effective role permissions — hydrated from the server shell, then kept
   *  fresh by PermissionSync (window focus + 60s poll) so an owner's change in
   *  Settings → Roles & permissions reaches open sessions without a re-login. */
  permissions: Capability[]
  setProfile: (p: Profile) => void
  setBranches: (b: Branch[]) => void
  setPlanCode: (c: PlanCode) => void
  setPermissions: (p: Capability[]) => void
}

export const useSessionStore = create<SessionStore>()((set) => ({
  profile: null,
  branches: [],
  planCode: null,
  permissions: [],
  setProfile: (p) => set({ profile: p }),
  setBranches: (b) => set({ branches: b }),
  setPlanCode: (c) => set({ planCode: c }),
  setPermissions: (p) => set({ permissions: p }),
}))

/** True when the signed-in user currently holds `cap`. */
export function useCan(cap: Capability): boolean {
  return useSessionStore((s) => s.permissions.includes(cap))
}
