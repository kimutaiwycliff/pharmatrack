"use client"

import { ChevronsUpDown } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useUIStore } from "@/lib/store/uiStore"
import { useSessionStore } from "@/lib/store/sessionStore"

export function BranchSelector() {
  const profile = useSessionStore((s) => s.profile)
  const branches = useSessionStore((s) => s.branches)
  const activeBranchId = useUIStore((s) => s.activeBranchId)
  const setActiveBranch = useUIStore((s) => s.setActiveBranch)

  const activeBranch = branches.find((b) => b.id === activeBranchId) ?? branches[0]
  const isOwnerOrManager = profile?.role === "owner" || profile?.role === "manager"

  if (!isOwnerOrManager || branches.length <= 1) {
    return (
      <span className="text-sm font-medium text-[var(--pt-text)]">
        {activeBranch?.name ?? branches[0]?.name ?? "Branch"}
      </span>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-1.5 text-sm font-medium text-[var(--pt-text)] hover:text-[var(--pt-green)] transition-colors cursor-pointer bg-transparent border-0">
        {activeBranch?.name ?? "All Branches"}
        <ChevronsUpDown size={13} className="text-[var(--pt-text-tertiary)]" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {branches.map((b) => (
          <DropdownMenuItem
            key={b.id}
            onClick={() => setActiveBranch(b.id)}
            className={activeBranchId === b.id ? "bg-[var(--pt-green-50)] text-[var(--pt-green-600)]" : ""}
          >
            {b.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
