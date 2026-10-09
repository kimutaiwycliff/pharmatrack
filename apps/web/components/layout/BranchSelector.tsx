"use client"

import { Check, ChevronsUpDown, Layers } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useUIStore } from "@/lib/store/uiStore"
import { useBranchScope } from "@/lib/hooks/useBranchScope"

// Back-office branch switcher. Users with `branches.all` can pick any branch or
// "All branches" (org-wide totals); everyone else just sees their branch name.
// The choice is remembered across reloads and POS ↔ dashboard navigation.
export function BranchSelector() {
  const { branches, branchId, isAll, canSeeAll, label } = useBranchScope()
  const setActiveBranch = useUIStore((s) => s.setActiveBranch)

  if (!canSeeAll || branches.length <= 1) {
    return <span className="text-sm font-medium text-[var(--pt-text)]">{branches.find((b) => b.id === branchId)?.name ?? branches[0]?.name ?? "Branch"}</span>
  }

  const item = (selected: boolean) =>
    `gap-2 ${selected ? "bg-[var(--pt-green-50)] text-[var(--pt-green-600)]" : ""}`

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-1.5 text-sm font-medium text-[var(--pt-text)] hover:text-[var(--pt-green)] transition-colors cursor-pointer bg-transparent border-0">
        {isAll && <Layers size={14} className="text-[var(--pt-green)]" />}
        {label}
        <ChevronsUpDown size={13} className="text-[var(--pt-text-tertiary)]" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-52">
        <DropdownMenuItem onClick={() => setActiveBranch(null)} className={item(isAll)}>
          <Layers size={14} />
          <span className="flex-1">All branches</span>
          {isAll && <Check size={14} />}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {branches.map((b) => (
          <DropdownMenuItem key={b.id} onClick={() => setActiveBranch(b.id)} className={item(branchId === b.id)}>
            <span className="flex-1">{b.name}</span>
            {branchId === b.id && <Check size={14} />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
