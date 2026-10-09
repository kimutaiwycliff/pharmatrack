"use client"

import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query"
import { useEffect, useRef } from "react"
import type { Profile, Branch } from "@pharmatrack/types"
import type { PlanCode, Capability } from "@pharmatrack/core"
import { useSessionStore } from "@/lib/store/sessionStore"
import { useUIStore } from "@/lib/store/uiStore"
import { ConfirmProvider } from "@/components/ui/confirm-dialog"

/** Pick a valid active branch WITHOUT clobbering the user's saved choice.
 *  (Previously every layout mount reset it to the profile's setup branch, so an
 *  owner's switch never stuck across reloads or POS ↔ dashboard navigation.) */
function reconcileBranch(profile: Profile, branches: Branch[], permissions: Capability[]) {
  const { activeBranchId, branchChosen, setActiveBranch } = useUIStore.getState()
  const fallback = profile.branch_id ?? branches[0]?.id ?? null
  const canSeeAll = permissions.includes("branches.all")

  if (!canSeeAll) {
    // Branch-locked staff always work in their assigned branch.
    if (activeBranchId !== fallback) setActiveBranch(fallback)
    return
  }
  const savedIsValid =
    branchChosen && (activeBranchId === null || branches.some((b) => b.id === activeBranchId))
  if (!savedIsValid) setActiveBranch(fallback)
}

function SessionInit({ profile, branches, planCode, permissions }: {
  profile: Profile; branches: Branch[]; planCode: PlanCode; permissions: Capability[]
}) {
  const setProfile = useSessionStore((s) => s.setProfile)
  const setBranches = useSessionStore((s) => s.setBranches)
  const setPlanCode = useSessionStore((s) => s.setPlanCode)
  const setPermissions = useSessionStore((s) => s.setPermissions)
  const initialized = useRef(false)

  // One-time hydration of the session stores from server props.
  /* eslint-disable react-hooks/refs */
  if (!initialized.current) {
    initialized.current = true
    setProfile(profile)
    setBranches(branches)
    setPlanCode(planCode)
    setPermissions(permissions)
  }
  /* eslint-enable react-hooks/refs */

  // Branch reconciliation reads the persisted (localStorage) selection, which
  // only exists in the browser — run it after mount, not during render.
  useEffect(() => {
    reconcileBranch(profile, branches, permissions)
  }, [profile, branches, permissions])

  return null
}

/** Keeps permissions live: refetched on window focus and every 60s, so an
 *  owner's change in Settings → Roles & permissions reaches open sessions
 *  (nav items, buttons) without anyone signing out. The server re-checks on
 *  every request regardless — this only keeps the UI honest. */
function PermissionSync() {
  const setPermissions = useSessionStore((s) => s.setPermissions)
  const profile = useSessionStore((s) => s.profile)
  const branches = useSessionStore((s) => s.branches)
  const { data } = useQuery<{ permissions: Capability[] }>({
    queryKey: ["me", "permissions"],
    queryFn: async () => {
      const res = await fetch("/api/me/permissions")
      if (!res.ok) throw new Error("Failed to load permissions")
      return res.json() as Promise<{ permissions: Capability[] }>
    },
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  })
  useEffect(() => {
    if (!data) return
    const current = useSessionStore.getState().permissions
    if (current.length === data.permissions.length && current.every((c, i) => c === data.permissions[i])) return
    setPermissions(data.permissions)
    if (profile) reconcileBranch(profile, branches, data.permissions)
  }, [data, setPermissions, profile, branches])
  return null
}

let queryClient: QueryClient | null = null

function getQueryClient() {
  if (!queryClient) {
    queryClient = new QueryClient({
      defaultOptions: { queries: { staleTime: 60 * 1000 } },
    })
  }
  return queryClient
}

export function Providers({
  children,
  profile,
  branches,
  planCode,
  permissions,
}: {
  children: React.ReactNode
  profile: Profile
  branches: Branch[]
  planCode: PlanCode
  permissions: Capability[]
}) {
  const client = getQueryClient()
  return (
    <QueryClientProvider client={client}>
      <SessionInit profile={profile} branches={branches} planCode={planCode} permissions={permissions} />
      <PermissionSync />
      <ConfirmProvider>{children}</ConfirmProvider>
    </QueryClientProvider>
  )
}
