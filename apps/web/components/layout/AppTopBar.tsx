"use client"

import { Bell, Menu, ChevronRight } from "lucide-react"
import { BranchSelector } from "./BranchSelector"
import { ShiftClockWidget } from "@/components/shifts/ShiftClockWidget"
import { useUIStore } from "@/lib/store/uiStore"
import { useSessionStore } from "@/lib/store/sessionStore"
import { Button } from "@/components/ui/button"

function initials(name: string) {
  return name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase()
}

export function AppTopBar() {
  const setSidebarCollapsed = useUIStore((s) => s.setSidebarCollapsed)
  const collapsed = useUIStore((s) => s.sidebarCollapsed)
  const profile = useSessionStore((s) => s.profile)
  const branches = useSessionStore((s) => s.branches)
  const activeBranchId = useUIStore((s) => s.activeBranchId)
  const activeBranch = branches.find((b) => b.id === activeBranchId) ?? branches[0]

  return (
    <header className="h-14 border-b border-[var(--pt-border)] bg-white flex items-center px-4 gap-4 shrink-0">
      {/* Mobile hamburger */}
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={() => setSidebarCollapsed(!collapsed)}
      >
        <Menu size={18} />
      </Button>

      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm text-[var(--pt-text-secondary)] min-w-0">
        <span className="truncate hidden sm:block">
          {branches[0] ? branches.find(b => b.id === branches[0]?.id)?.name?.split(" ")[0] ?? "Nairobi Pharmacy" : "PharmaTrack"}
        </span>
        {activeBranch && (
          <>
            <ChevronRight size={12} />
            <BranchSelector />
          </>
        )}
      </div>

      <div className="flex-1" />

      <ShiftClockWidget />

      {/* Notifications */}
      <button className="relative w-9 h-9 rounded-lg border border-[var(--pt-border)] flex items-center justify-center text-[var(--pt-text-secondary)] hover:bg-gray-50 transition-colors">
        <Bell size={16} />
      </button>

      {/* Avatar */}
      <div className="flex items-center gap-2">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
          style={{ background: "var(--pt-green-50)", color: "var(--pt-green-600)" }}
        >
          {initials(profile?.full_name ?? "?")}
        </div>
        <div className="hidden sm:block leading-none">
          <p className="text-[13px] font-semibold">{profile?.full_name}</p>
          <p className="text-[11px] text-[var(--pt-text-secondary)] capitalize">{profile?.role}</p>
        </div>
      </div>
    </header>
  )
}
