"use client"

import { Menu } from "lucide-react"
import { BranchSelector } from "./BranchSelector"
import { ThemeToggle } from "@/components/theme/ThemeToggle"
import { ShiftClockWidget } from "@/components/shifts/ShiftClockWidget"
import { UserMenu } from "./UserMenu"
import { NotificationsMenu } from "./NotificationsMenu"
import { useUIStore } from "@/lib/store/uiStore"
import { useSessionStore } from "@/lib/store/sessionStore"
import { Button } from "@/components/ui/button"
import { useBranchScope } from "@/lib/hooks/useBranchScope"

export function AppTopBar() {
  const setMobileNavOpen = useUIStore((s) => s.setMobileNavOpen)
  const profile = useSessionStore((s) => s.profile)
  const branches = useSessionStore((s) => s.branches)
  const { branchId, ready } = useBranchScope()

  return (
    <header className="h-14 border-b border-[var(--pt-border)] bg-[var(--pt-surface)] flex items-center px-3 sm:px-4 gap-2 sm:gap-4 shrink-0">
      {/* Mobile hamburger */}
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        aria-label="Open menu"
        onClick={() => setMobileNavOpen(true)}
      >
        <Menu size={18} />
      </Button>

      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm text-[var(--pt-text-secondary)] min-w-0">
        {branches.length > 0 ? <BranchSelector /> : <span className="truncate">PharmaTrack</span>}
      </div>

      <div className="flex-1" />

      <ShiftClockWidget />

      {/* Theme */}
      <ThemeToggle />

      {/* Notifications */}
      <NotificationsMenu branchId={branchId} ready={ready} />

      {/* Avatar + dropdown (Settings, Sign out) */}
      <UserMenu fullName={profile?.full_name} role={profile?.role} />
    </header>
  )
}
