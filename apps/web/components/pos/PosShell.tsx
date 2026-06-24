"use client"

import { useState } from "react"
import { ArrowLeft, Clock, LogOut } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ClockInDialog } from "./ClockInDialog"
import { ClockOutDialog } from "./ClockOutDialog"
import { OfflineSync } from "./OfflineSync"
import { OfflineQueueBadge } from "./OfflineQueueBadge"
import { ThemeToggle } from "@/components/theme/ThemeToggle"
import { useOnline } from "@/lib/offline/useOnline"
import { WifiOff } from "lucide-react"
import { useActiveShift } from "@/lib/hooks/useActiveShift"
import { useSessionStore } from "@/lib/store/sessionStore"
import { useUIStore } from "@/lib/store/uiStore"
import { LogoutButton } from "@/components/LogoutButton"

function formatDuration(from: string) {
  const ms = Date.now() - new Date(from).getTime()
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return `${h}h ${m}m`
}

function initials(name: string) {
  return name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase()
}

export function PosShell({ userId, children }: { userId: string; children: React.ReactNode }) {
  const [clockOutOpen, setClockOutOpen] = useState(false)
  const { data: shift, refetch } = useActiveShift(userId)
  const profile = useSessionStore((s) => s.profile)
  const branches = useSessionStore((s) => s.branches)
  const activeBranchId = useUIStore((s) => s.activeBranchId)
  const activeBranch = branches.find((b) => b.id === activeBranchId) ?? branches[0]
  const online = useOnline()

  const isLoading = shift === undefined

  // Show clock-in gate if no active shift
  if (!isLoading && !shift) {
    return <ClockInDialog onSuccess={() => refetch()} />
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[var(--pt-bg)]">
      {/* POS Top Bar */}
      <header className="h-14 border-b border-[var(--pt-border)] bg-[var(--pt-surface)] flex items-center px-3 sm:px-4 gap-2 sm:gap-4 shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[var(--pt-green)] flex items-center justify-center">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </div>
        </div>

        <div className="w-px h-6 bg-[var(--pt-border)]" />

        {/* Branch breadcrumb */}
        <div className="flex items-center gap-1.5 text-sm font-medium text-[var(--pt-text)] min-w-0">
          <span className="text-[var(--pt-text-secondary)] text-xs hidden sm:block">Nairobi Pharmacy</span>
          <span className="text-[var(--pt-text-tertiary)] text-xs hidden sm:block">›</span>
          <span className="truncate">{activeBranch?.name ?? "Branch"}</span>
        </div>

        <div className="flex-1" />

        {/* Offline + queued-sales indicators */}
        {!online && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 text-xs font-semibold">
            <WifiOff size={13} /> Offline
          </div>
        )}
        <OfflineQueueBadge />

        {/* Shift indicator */}
        {shift && (
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--pt-green-50)] text-[var(--pt-green-600)] text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-[var(--pt-green)] animate-pulse" />
            Shift active · {formatDuration(shift.clocked_in_at)}
          </div>
        )}

        {/* Back to dashboard (non-cashier only) */}
        {profile?.role !== "cashier" && (
          <Link href="/dashboard">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8">
              <ArrowLeft size={13} />
              <span className="hidden sm:inline">Dashboard</span>
            </Button>
          </Link>
        )}

        {/* Cashier info */}
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

        {/* End shift */}
        {shift && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setClockOutOpen(true)}
            className="gap-1.5 text-xs h-8 text-[var(--pt-red)] border-[var(--pt-red)] hover:bg-[var(--pt-red-50)]"
          >
            <Clock size={13} />
            <span className="hidden sm:inline">End Shift</span>
          </Button>
        )}

        {/* Theme */}
        <ThemeToggle className="!w-8 !h-8" />

        {/* Sign out */}
        <LogoutButton
          title="Sign out"
          className="h-8 w-8 inline-flex items-center justify-center rounded-md text-[var(--pt-text-secondary)] hover:bg-[var(--pt-muted-strong)] transition-colors"
        >
          <LogOut size={15} />
        </LogoutButton>
      </header>

      {/* Background sync of any offline sales */}
      <OfflineSync />

      {/* POS content */}
      <main className="flex-1 overflow-hidden">{children}</main>

      {/* Clock-out dialog */}
      {shift && (
        <ClockOutDialog
          open={clockOutOpen}
          onOpenChange={setClockOutOpen}
          shift={shift}
          onSuccess={() => {
            setClockOutOpen(false)
            refetch()
          }}
        />
      )}
    </div>
  )
}
