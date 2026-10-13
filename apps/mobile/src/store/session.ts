import { create } from "zustand"
import { eq } from "drizzle-orm"
import { apiFetch } from "../lib/api-fetch"
import { ApiError, errorMessage } from "../lib/api"
import { httpMessage } from "../lib/errors"
import { kvGet, kvSet } from "../lib/kv"
import { env } from "../lib/env"
import { getCurrentStaff } from "../lib/local-auth"
import { db } from "../db/database"
import { branches } from "../db/schema"

// ADR-014 — fixed placeholder: an Offline Edition install is single-tenant,
// so there's no real "organization" to distinguish. Kept as a value (not
// null) because OnlineIndex/other screens already treat organizationId as
// the "am I signed in" signal alongside role/branchId.
const OFFLINE_ORG_ID = "offline"

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
  // Capability list from packages/core/src/permissions.ts (e.g. devices.manage).
  // Optional: caches written before R1 don't have it.
  permissions?: string[]
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
  permissions: string[]
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
// Concurrent loadMe() calls (tab layout + POS + staff switch) share one request.
let inFlight: Promise<void> | null = null

export const useSessionStore = create<SessionState>((set) => ({
  organizationId: null,
  role: null,
  branchId: null,
  branches: [],
  subStatus: null,
  planCode: null,
  contact: null,
  permissions: [],
  loaded: false,
  error: null,
  stale: false,
  loadMe() {
    inFlight ??= loadMeOnce().finally(() => {
      inFlight = null
    })
    return inFlight
  },
  setBranchId(id) {
    set({ branchId: id })
  },
}))

// One set per outcome — each set re-renders every subscriber. The error is
// only cleared up front when there is one (so a Retry shows the spinner).
async function loadMeOnce(): Promise<void> {
  const set = useSessionStore.setState
  if (useSessionStore.getState().error) set({ error: null })
  if (env.EXPO_PUBLIC_OFFLINE_MODE) {
    try {
      const staffRow = await getCurrentStaff()
      if (!staffRow) {
        set({ error: "You're not signed in. Sign in again to continue.", loaded: true })
        return
      }
      const allBranches = await db.select().from(branches).where(eq(branches.isActive, true))
      const cached: CachedSession = {
        organizationId: OFFLINE_ORG_ID,
        role: staffRow.role,
        branchId: staffRow.branchId ?? allBranches[0]?.id ?? null,
        branches: allBranches.map((b) => ({ id: b.id, name: b.name })),
        subStatus: "active",
        planCode: "enterprise",
        contact: null,
        permissions: [],
      }
      set({ ...cached, loaded: true, stale: false, error: null })
    } catch (err) {
      set({ error: errorMessage(err, "Couldn't open your account on this phone. Restart the app and try again.") })
    }
    return
  }
  try {
    const res = await apiFetch("/api/mobile/me")
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: unknown } | null
      throw new ApiError(res.status, httpMessage(res.status, typeof body?.error === "string" ? body.error : null))
    }
    const data = (await res.json()) as {
      organizationId: string
      role: string
      branchId: string | null
      branches: Branch[]
      subStatus: string | null
      planCode: string
      contact: Contact | null
      permissions?: string[]
    }
    const cached: CachedSession = {
      organizationId: data.organizationId,
      role: data.role,
      branchId: data.branchId ?? data.branches[0]?.id ?? null,
      branches: data.branches,
      subStatus: data.subStatus,
      planCode: data.planCode,
      contact: data.contact,
      permissions: data.permissions ?? [],
    }
    set({ ...cached, loaded: true, stale: false, error: null })
    await kvSet(CACHE_KEY, cached).catch(() => undefined) // cache only
  } catch (err) {
    // Plain wording only (lib/errors.ts) — the raw DNS/TLS/HTTP text is
    // logged by errorMessage() in development rather than shown.
    const reason = errorMessage(err, "Couldn't load your account. Check your connection and try again.")
    const cached = await kvGet<CachedSession>(CACHE_KEY).catch(() => null)
    if (cached) {
      set({ ...cached, permissions: cached.permissions ?? [], loaded: true, stale: true, error: `Offline — showing last known data. ${reason}` })
    } else {
      set({ error: reason })
    }
  }
}
