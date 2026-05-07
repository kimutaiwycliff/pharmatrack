"use client"

import { useState } from "react"
import { ArrowLeft, Clock, LogOut } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ClockInDialog } from "./ClockInDialog"
import { ClockOutDialog } from "./ClockOutDialog"
import { useActiveShift } from "@/lib/hooks/useActiveShift"
import { useSessionStore } from "@/lib/store/sessionStore"
import { useUIStore } from "@/lib/store/uiStore"
import { signOut } from "@/app/(auth)/login/actions"

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

  const isLoading = shift === undefined

  // Show clock-in gate if no active shift
  if (!isLoading && !shift) {
    return <ClockInDialog onSuccess={() => refetch()} />
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[var(--pt-bg)]">
      {/* POS Top Bar */}
      <header className="h-14 border-b border-[var(--pt-border)] bg-white flex items-center px-4 gap-4 shrink-0">
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
        <div className="flex items-center gap-1.5 text-sm font-medium text-[var(--pt-text)]">
          <span className="text-[var(--pt-text-secondary)] text-xs hidden sm:block">Nairobi Pharmacy</span>
          <span className="text-[var(--pt-text-tertiary)] text-xs hidden sm:block">›</span>
          <span>{activeBranch?.name ?? "Branch"}</span>
        </div>

        <div className="flex-1" />

        {/* Shift indicator */}
        {shift && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--pt-green-50)] text-[var(--pt-green-600)] text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-[var(--pt-green)] animate-pulse" />
            Shift active · {formatDuration(shift.clocked_in_at)}
          </div>
        )}

        {/* Back to dashboard (non-cashier only) */}
        {profile?.role !== "cashier" && (
          <Link href="/dashboard">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8">
              <ArrowLeft size={13} />
              Dashboard
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
            End Shift
          </Button>
        )}

        {/* Sign out */}
        <form action={signOut}>
          <Button variant="ghost" size="icon" type="submit" title="Sign out" className="h-8 w-8">
            <LogOut size={15} />
          </Button>
        </form>
      </header>

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
