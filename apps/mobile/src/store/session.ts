import { create } from "zustand"
import { apiFetch } from "../lib/api-fetch"

interface Branch {
  id: string
  name: string
}

interface SessionState {
  organizationId: string | null
  role: string | null
  branchId: string | null
  branches: Branch[]
  loaded: boolean
  loadMe: () => Promise<void>
  setBranchId: (id: string) => void
}

// Populates from GET /api/mobile/me (apps/web/app/api/mobile/me/route.ts) —
// the one new backend endpoint this app needed, mirroring what the web app
// resolves server-side via a layout component (lib/auth/app-shell.ts).
export const useSessionStore = create<SessionState>((set) => ({
  organizationId: null,
  role: null,
  branchId: null,
  branches: [],
  loaded: false,
  async loadMe() {
    const res = await apiFetch("/api/mobile/me")
    if (!res.ok) return
    const data = (await res.json()) as {
      organizationId: string
      role: string
      branchId: string | null
      branches: Branch[]
    }
    set({
      organizationId: data.organizationId,
      role: data.role,
      branchId: data.branchId ?? data.branches[0]?.id ?? null,
      branches: data.branches,
      loaded: true,
    })
  },
  setBranchId(id) {
    set({ branchId: id })
  },
}))
