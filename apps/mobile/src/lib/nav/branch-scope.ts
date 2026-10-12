/** "all" = every branch; a branch id; null = not chosen yet (use the session branch). */
export type BranchScope = "all" | string | null

/**
 * Resolve a stored branch scope against what the user may see (store/branchScope.ts).
 * Without branches.all you're pinned to your session branch; a stored branch
 * that no longer exists falls back to the session branch.
 */
export function resolveBranchScope(
  scope: BranchScope,
  opts: { canSwitch: boolean; sessionBranchId: string | null; branches: { id: string; name: string }[] },
): { branchId: string | undefined; isAll: boolean } {
  if (!opts.canSwitch) return { branchId: opts.sessionBranchId ?? undefined, isAll: false }
  if (scope === "all") return { branchId: undefined, isAll: true }
  if (scope && opts.branches.some((b) => b.id === scope)) return { branchId: scope, isAll: false }
  return { branchId: opts.sessionBranchId ?? undefined, isAll: !opts.sessionBranchId }
}
