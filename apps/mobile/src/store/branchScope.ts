import { useMemo } from "react"
import { create } from "zustand"
import { useCan } from "../hooks/useCan"
import { kvGetSync, kvSetSync } from "../lib/kv"
import { resolveBranchScope, type BranchScope } from "../lib/nav/branch-scope"
import { useSessionStore } from "./session"

// R3: which branch the online back-office screens (Dashboard, Inventory,
// Sales, Reports, Shift history) look at. Only people with branches.all can
// change it — "all" or any branch — and the choice is remembered in kv. Everyone
// else is pinned to their session branch (the server enforces that too: a
// branch-locked user's branch_id is overridden server-side).

export type { BranchScope }

const KEY = "branch_scope"

interface BranchScopeState {
  scope: BranchScope
  setScope: (scope: Exclude<BranchScope, null>) => void
}

function initial(): BranchScope {
  try {
    return kvGetSync<string>(KEY)
  } catch {
    return null
  }
}

const useBranchScopeStore = create<BranchScopeState>((set) => ({
  scope: initial(),
  setScope(scope) {
    kvSetSync(KEY, scope)
    set({ scope })
  },
}))

export interface BranchScopeInfo {
  /** Value for the API's `branch_id` query param — undefined = all branches. */
  branchId: string | undefined
  /** True when looking at every branch. */
  isAll: boolean
  /** Human label: "All branches" or the branch name. */
  label: string
  canSwitch: boolean
  branches: { id: string; name: string }[]
  /** Current selection key ("all" or a branch id) for a picker. */
  selected: string
  setScope: (scope: "all" | string) => void
}

export function useBranchScope(): BranchScopeInfo {
  const can = useCan()
  const scope = useBranchScopeStore((s) => s.scope)
  const setScope = useBranchScopeStore((s) => s.setScope)
  const sessionBranchId = useSessionStore((s) => s.branchId)
  const branches = useSessionStore((s) => s.branches)
  const canSwitch = can("branches.all") && branches.length > 1
  return useMemo(() => {
    const { branchId, isAll } = resolveBranchScope(scope, { canSwitch, sessionBranchId, branches })
    const label = isAll ? "All branches" : (branches.find((b) => b.id === branchId)?.name ?? "This branch")
    return { branchId, isAll, label, canSwitch, branches, selected: isAll ? "all" : (branchId ?? "all"), setScope }
  }, [scope, canSwitch, sessionBranchId, branches, setScope])
}
