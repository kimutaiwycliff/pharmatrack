"use client"

import { useUIStore } from "@/lib/store/uiStore"
import { useSessionStore, useCan } from "@/lib/store/sessionStore"

/**
 * The branch the back office is currently looking at.
 *  - `branchId` set  → one branch.
 *  - `isAll`         → "All branches" (only for users with `branches.all`);
 *                      APIs aggregate across the org when branch_id is omitted.
 *  - `ready` false   → the saved selection hasn't been reconciled yet (first
 *                      render) — hold queries until it is.
 * Branch-bound actions (selling, clocking in, receiving stock) need a real
 * branch: when `isAll`, they ask the user to pick one.
 */
export function useBranchScope() {
  const activeBranchId = useUIStore((s) => s.activeBranchId)
  const branchChosen = useUIStore((s) => s.branchChosen)
  const branches = useSessionStore((s) => s.branches)
  const canSeeAll = useCan("branches.all")

  const isAll = canSeeAll && branchChosen && activeBranchId === null
  const branch = isAll ? null : branches.find((b) => b.id === activeBranchId) ?? null
  const branchId = branch?.id ?? null

  return {
    branchId,
    branch,
    isAll,
    ready: isAll || branchId !== null,
    branches,
    canSeeAll,
    /** `branch_id=<id>&` or "" for All — prefix for API query strings. */
    branchParam: branchId ? `branch_id=${branchId}&` : "",
    label: isAll ? "All branches" : branch?.name ?? "Branch",
  }
}
