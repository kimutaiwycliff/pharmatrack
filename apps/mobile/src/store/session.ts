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
  error: string | null
  loadMe: () => Promise<void>
  setBranchId: (id: string) => void
}

// Populates from GET /api/mobile/me (apps/web/app/api/mobile/me/route.ts) —
// the one new backend endpoint this app needed, mirroring what the web app
// resolves server-side via a layout component (lib/auth/app-shell.ts). Surfaces
// failures (network error, non-2xx, unparseable body) as `error` instead of
// leaving the caller stuck on a loading state with no way to retry.
export const useSessionStore = create<SessionState>((set) => ({
  organizationId: null,
  role: null,
  branchId: null,
  branches: [],
  loaded: false,
  error: null,
  async loadMe() {
    set({ error: null })
    try {
      const res = await apiFetch("/api/mobile/me")
      if (!res.ok) {
        set({ error: `Could not load session (HTTP ${res.status})` })
        return
      }
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
    } catch {
      set({ error: "Could not reach the server. Check your connection and try again." })
    }
  },
  setBranchId(id) {
    set({ branchId: id })
  },
}))
