"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useRef } from "react"
import type { Profile, Branch } from "@pharmatrack/types"
import type { PlanCode } from "@pharmatrack/core"
import { useSessionStore } from "@/lib/store/sessionStore"
import { useUIStore } from "@/lib/store/uiStore"
import { ConfirmProvider } from "@/components/ui/confirm-dialog"

function SessionInit({ profile, branches, planCode }: { profile: Profile; branches: Branch[]; planCode: PlanCode }) {
  const setProfile = useSessionStore((s) => s.setProfile)
  const setBranches = useSessionStore((s) => s.setBranches)
  const setPlanCode = useSessionStore((s) => s.setPlanCode)
  const setActiveBranch = useUIStore((s) => s.setActiveBranch)
  const initialized = useRef(false)

  // One-time hydration of the session stores from server props.
  /* eslint-disable react-hooks/refs */
  if (!initialized.current) {
    initialized.current = true
    setProfile(profile)
    setBranches(branches)
    setPlanCode(planCode)
    // Default active branch: user's own branch, or first org branch for owners
    const defaultBranch = profile.branch_id ?? branches[0]?.id ?? null
    setActiveBranch(defaultBranch)
  }
  /* eslint-enable react-hooks/refs */

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
}: {
  children: React.ReactNode
  profile: Profile
  branches: Branch[]
  planCode: PlanCode
}) {
  const client = getQueryClient()
  return (
    <QueryClientProvider client={client}>
      <SessionInit profile={profile} branches={branches} planCode={planCode} />
      <ConfirmProvider>{children}</ConfirmProvider>
    </QueryClientProvider>
  )
}
