"use client"

import { useCallback, useState } from "react"
import { ArrowLeft, Clock, Loader2, LogOut, Users } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ClockInDialog } from "./ClockInDialog"
import { ClockOutDialog } from "./ClockOutDialog"
import { OfflineSync } from "./OfflineSync"
import { OfflineQueueBadge } from "./OfflineQueueBadge"
import { DeadLetterBadge } from "./DeadLetterBadge"
import { DeviceStatusBadges } from "./DeviceStatusBadges"
import { ReceiptModal } from "./ReceiptModal"
import { ThemeToggle } from "@/components/theme/ThemeToggle"
import { TillRunner } from "@/components/till/TillRunner"
import { TillStatusPill, TillSyncSheet } from "@/components/till/TillSync"
import { SwitchCashierDialog, TillBanners, TillClockIn, TillClockOutDialog, TillLockScreen } from "@/components/till/TillGates"
import { OfflineSetupBanner, SetupTillDialog } from "@/components/till/SetupTill"
import { useOnline } from "@/lib/offline/useOnline"
import { WifiOff } from "lucide-react"
import { useActiveShift } from "@/lib/hooks/useActiveShift"
import { useSessionStore } from "@/lib/store/sessionStore"
import { hasBackOfficeAccess } from "@pharmatrack/core"
import type { SalePayload } from "@pharmatrack/core/sync"
import { useUIStore } from "@/lib/store/uiStore"
import { useTillActive, useTillStore } from "@/lib/till/store"
import { receiptFromPayload } from "@/lib/till/receipt"
import type { OutboxRow } from "@/lib/till/db"
import { LogoutButton } from "@/components/LogoutButton"

function formatDuration(from: string | number) {
  const ms = Date.now() - new Date(from).getTime()
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return `${h}h ${m}m`
}

function initials(name: string) {
  return name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase()
}

// POS frame. Two modes:
//  • registered till (this browser / desktop app was set up for offline
//    selling): shifts, cashier and sales live on this computer and sync via
//    /api/sync — see lib/till. Works all day without internet.
//  • plain browser: server shifts, with the older queue-when-offline fallback.
export function PosShell({ userId, children }: { userId: string; children: React.ReactNode }) {
  const [clockOutOpen, setClockOutOpen] = useState(false)
  const [syncOpen, setSyncOpen] = useState(false)
  const [setupOpen, setSetupOpen] = useState(false)
  const [switchOpen, setSwitchOpen] = useState(false)
  const [reprint, setReprint] = useState<ReturnType<typeof receiptFromPayload> | null>(null)
  const openSync = useCallback(() => setSyncOpen(true), [])

  const till = useTillStore()
  const tillActive = useTillActive()
  // The server shift is only used by an unregistered browser.
  const { data: shift, refetch } = useActiveShift(till.ready && !tillActive ? userId : null)
  const profile = useSessionStore((s) => s.profile)
  const permissions = useSessionStore((s) => s.permissions)
  const branches = useSessionStore((s) => s.branches)
  const activeBranchId = useUIStore((s) => s.activeBranchId)
  const tillBranch = tillActive ? branches.find((b) => b.id === till.device?.branchId) : undefined
  const activeBranch =
    tillBranch ?? branches.find((b) => b.id === shift?.branch_id) ?? branches.find((b) => b.id === activeBranchId) ?? branches[0]
  const online = useOnline()

  // Someone switched in by PIN: back-office links would act as the signed-in user, so hide them.
  const sellingAsOther = tillActive && !!till.staff && till.staff.id !== profile?.id
  const sellerName = tillActive ? till.staff?.name : profile?.full_name
  const sellerRole = tillActive ? till.staff?.role : profile?.role

  const onReprint = useCallback((row: OutboxRow) => {
    if (row.type !== "sale") return
    const b = branches.find((x) => x.id === till.device?.branchId)
    setSyncOpen(false)
    setReprint(receiptFromPayload(row.payload as SalePayload, {
      branchId: till.device?.branchId ?? "",
      branchName: till.branch?.name ?? b?.name ?? "Branch",
      branchAddress: till.branch?.address ?? b?.address ?? null,
      branchPhone: till.branch?.phone ?? b?.phone ?? null,
      orgName: till.device?.organizationName ?? "PharmaTrack",
      cashierName: null,
    }))
  }, [branches, till.device, till.branch])

  const runner = <TillRunner onOpenSync={openSync} />

  if (!till.ready) {
    return (
      <div className="h-screen flex items-center justify-center bg-[var(--pt-bg)] text-[var(--pt-text-secondary)]">
        {runner}
        <Loader2 size={20} className="animate-spin" />
      </div>
    )
  }

  if (tillActive) {
    if (till.lock.locked && till.lock.reason) {
      return <>{runner}<TillLockScreen onSetUpAgain={() => setSetupOpen(true)} /><SetupTillDialog open={setupOpen} onOpenChange={setSetupOpen} /></>
    }
    if (!till.shift) return <>{runner}<TillClockIn /></>
  } else if (shift === null) {
    return <ClockInDialog onSuccess={() => refetch()} />
  }

  const shiftStart = tillActive ? till.shift?.opened_at : shift?.clocked_in_at

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[var(--pt-bg)]">
      {runner}
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
          <span className="truncate">{activeBranch?.name ?? "Branch"}</span>
          {tillActive && till.device && (
            <span className="hidden lg:inline text-xs text-[var(--pt-text-tertiary)]">· {till.device.name} ({till.device.code})</span>
          )}
        </div>

        <div className="flex-1" />

        {/* Connection + sync */}
        {tillActive ? (
          <TillStatusPill onOpen={openSync} />
        ) : (
          <>
            {!online && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 text-xs font-semibold">
                <WifiOff size={13} /> Offline
              </div>
            )}
            <OfflineQueueBadge />
            <DeadLetterBadge />
          </>
        )}
        <DeviceStatusBadges />

        {/* Shift indicator */}
        {shiftStart && (
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--pt-green-50)] text-[var(--pt-green-600)] text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-[var(--pt-green)] animate-pulse" />
            Shift · {formatDuration(shiftStart)}
          </div>
        )}

        {/* Back to dashboard (non-cashier only) */}
        {hasBackOfficeAccess(permissions) && !sellingAsOther && (
          <Link href="/dashboard">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8">
              <ArrowLeft size={13} />
              <span className="hidden sm:inline">Dashboard</span>
            </Button>
          </Link>
        )}

        {/* Who is selling */}
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
            style={{ background: "var(--pt-green-50)", color: "var(--pt-green-600)" }}
          >
            {initials(sellerName ?? "?")}
          </div>
          <div className="hidden sm:block leading-none">
            <p className="text-[13px] font-semibold">{sellerName}</p>
            <p className="text-[11px] text-[var(--pt-text-secondary)] capitalize">{sellerRole}</p>
          </div>
          {tillActive && (
            <button
              onClick={() => setSwitchOpen(true)}
              title="Switch cashier (works offline)"
              aria-label="Switch cashier"
              className="h-8 w-8 inline-flex items-center justify-center rounded-md text-[var(--pt-text-secondary)] hover:bg-[var(--pt-muted-strong)] transition-colors"
            >
              <Users size={15} />
            </button>
          )}
        </div>

        {/* End shift */}
        {shiftStart && (
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

      {tillActive ? <TillBanners onOpenSync={openSync} /> : <OfflineSetupBanner onSetUp={() => setSetupOpen(true)} />}
      {till.wrongOrg && (
        <div className="shrink-0 px-4 py-2 text-xs bg-amber-50 dark:bg-amber-500/15 text-amber-800 dark:text-amber-200 border-b border-[var(--pt-border)]">
          This computer is set up for offline selling for another pharmacy, so offline selling is off while you&apos;re signed in here.
        </div>
      )}

      {/* Older queue-when-offline fallback for unregistered browsers */}
      {!tillActive && <OfflineSync />}

      {/* POS content */}
      <main className="flex-1 overflow-hidden">{children}</main>

      {/* Clock-out */}
      {tillActive && till.shift ? (
        <TillClockOutDialog open={clockOutOpen} onOpenChange={setClockOutOpen} shift={till.shift} />
      ) : shift ? (
        <ClockOutDialog
          open={clockOutOpen}
          onOpenChange={setClockOutOpen}
          shift={shift}
          onSuccess={() => {
            setClockOutOpen(false)
            refetch()
          }}
        />
      ) : null}

      {tillActive && (
        <>
          <TillSyncSheet open={syncOpen} onOpenChange={setSyncOpen} onReprint={onReprint} />
          <SwitchCashierDialog open={switchOpen} onOpenChange={setSwitchOpen} />
          <ReceiptModal open={reprint !== null} data={reprint} onNewSale={() => setReprint(null)} closeLabel="Close" />
        </>
      )}
      <SetupTillDialog open={setupOpen} onOpenChange={setSetupOpen} />
    </div>
  )
}
