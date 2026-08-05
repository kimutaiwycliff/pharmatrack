import { create } from "zustand"
import { apiFetch } from "../lib/api-fetch"
import { kvGet, kvSet } from "../lib/kv"

interface Branch {
  id: string
  name: string
}

interface Contact {
  whatsappLink: string
  mailtoLink: string
}

// planCode/subStatus mirror apps/web/lib/auth/app-shell.ts's AppShell shape
// (packages/core's PlanCode union: "starter" | "growth" | "enterprise").
// subStatus is the raw subscription table status string
// ("trialing" | "active" | "past_due" | "suspended" | "cancelled" | null).
interface CachedSession {
  organizationId: string
  role: string
  branchId: string | null
  branches: Branch[]
  subStatus: string | null
  planCode: string
  contact: Contact | null
}

const CACHE_KEY = "session"

interface SessionState {
  organizationId: string | null
  role: string | null
  branchId: string | null
  branches: Branch[]
  subStatus: string | null
  planCode: string | null
  contact: Contact | null
  loaded: boolean
  error: string | null
  stale: boolean
  loadMe: () => Promise<void>
  setBranchId: (id: string) => void
}

// Populates from GET /api/mobile/me (apps/web/app/api/mobile/me/route.ts) —
// the one new backend endpoint this app needed, mirroring what the web app
// resolves server-side via a layout component (lib/auth/app-shell.ts). Surfaces
// failures (network error, non-2xx, unparseable body) as `error` instead of
// leaving the caller stuck on a loading state with no way to retry.
// On failure, falls back to the last-known session cached in local SQLite
// (kv.ts) instead of leaving the app blocked — this is what lets POS survive
// a cold start with no connectivity, per CLAUDE.md's "offline POS must work
// indefinitely" rule. `stale: true` marks that fallback so callers can show a
// non-blocking "offline" notice rather than hard-gating the whole screen.
export const useSessionStore = create<SessionState>((set) => ({
  organizationId: null,
  role: null,
  branchId: null,
  branches: [],
  subStatus: null,
  planCode: null,
  contact: null,
  loaded: false,
  error: null,
  stale: false,
  async loadMe() {
    set({ error: null })
    try {
      const res = await apiFetch("/api/mobile/me")
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as {
        organizationId: string
        role: string
        branchId: string | null
        branches: Branch[]
        subStatus: string | null
        planCode: string
        contact: Contact | null
      }
      const cached: CachedSession = {
        organizationId: data.organizationId,
        role: data.role,
        branchId: data.branchId ?? data.branches[0]?.id ?? null,
        branches: data.branches,
        subStatus: data.subStatus,
        planCode: data.planCode,
        contact: data.contact,
      }
      set({ ...cached, loaded: true, stale: false })
      await kvSet(CACHE_KEY, cached)
    } catch (err) {
      // The underlying message (DNS failure, TLS error, timeout, etc.) is
      // appended rather than shown alone — a generic "check your connection"
      // string was indistinguishable, twice already during development,
      // from an actual reachable-network-but-server-unreachable failure
      // (a real carrier DNS outage) versus a genuine app bug. Surfacing it
      // directly means the next occurrence is self-diagnosing from a
      // screenshot instead of needing an instrumented rebuild.
      const detail = err instanceof Error ? err.message : String(err)
      const cached = await kvGet<CachedSession>(CACHE_KEY)
      if (cached) {
        set({ ...cached, loaded: true, stale: true, error: `Offline — showing last known data (${detail})` })
      } else {
        set({ error: `Could not reach the server: ${detail}` })
      }
    }
  },
  setBranchId(id) {
    set({ branchId: id })
  },
}))
