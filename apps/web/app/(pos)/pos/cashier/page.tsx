"use client"

import Link from "next/link"
import { Loader2 } from "lucide-react"
import { CashierStation } from "@/components/cashier-station/CashierStation"
import { useActiveShift } from "@/lib/hooks/useActiveShift"
import { useSessionStore } from "@/lib/store/sessionStore"
import { useUIStore } from "@/lib/store/uiStore"
import { useStationRole, useStationStatus } from "@/lib/cashier-station/client"
import { isUuid } from "@/lib/utils"

// The cashier station (ADR-021). PosShell has already made sure this computer
// is the cashier and has an open shift (cash goes into that drawer).
export default function CashierPage() {
  const profile = useSessionStore((s) => s.profile)
  const branches = useSessionStore((s) => s.branches)
  const activeBranchId = useUIStore((s) => s.activeBranchId)
  const { data: shift } = useActiveShift(profile?.id ?? "")
  const branch =
    branches.find((b) => b.id === shift?.branch_id && isUuid(b.id)) ??
    branches.find((b) => b.id === activeBranchId && isUuid(b.id)) ??
    branches.find((b) => isUuid(b.id)) ??
    null
  const { data: station, isFetched } = useStationStatus(branch?.id)
  const { role } = useStationRole(branch?.id, station)

  if (!profile || !branch || !isFetched || shift === undefined) {
    return <div className="flex h-full items-center justify-center"><Loader2 size={20} className="animate-spin" /></div>
  }
  if (role !== "cashier" || !shift) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-[var(--pt-text-secondary)]">
        <p>This computer isn&apos;t the cashier station for {branch.name}.</p>
        <Link href="/pos" className="underline">Back to the till</Link>
      </div>
    )
  }
  return <CashierStation branch={branch} shiftId={shift.id} cashierName={profile.full_name} />
}
