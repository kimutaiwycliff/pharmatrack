"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Clock, ArrowLeft } from "lucide-react"
import { useSessionStore, useCan } from "@/lib/store/sessionStore"
import { useUIStore } from "@/lib/store/uiStore"

interface ClockInDialogProps {
  onSuccess: () => void
}

function formatKES(n: number) {
  return new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES" }).format(n)
}

export function ClockInDialog({ onSuccess }: ClockInDialogProps) {
  const [openingFloat, setOpeningFloat] = useState("")
  const [error, setError] = useState("")
  const [isPending, startTransition] = useTransition()
  const branches = useSessionStore((s) => s.branches)
  const profile = useSessionStore((s) => s.profile)
  const activeBranchId = useUIStore((s) => s.activeBranchId)
  const setActiveBranch = useUIStore((s) => s.setActiveBranch)
  const canPickBranch = useCan("branches.all") && branches.length > 1
  const [branchId, setBranchId] = useState(
    branches.find((b) => b.id === activeBranchId)?.id ?? profile?.branch_id ?? branches[0]?.id ?? "",
  )

  const now = new Date().toLocaleString("en-KE", {
    timeZone: "Africa/Nairobi",
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })

  function handleClockIn() {
    const float = parseFloat(openingFloat || "0")
    if (isNaN(float) || float < 0) {
      setError("Enter a valid opening float (0 or more)")
      return
    }
    setError("")
    startTransition(async () => {
      const res = await fetch("/api/shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(canPickBranch && branchId ? { opening_float: float, branch_id: branchId } : { opening_float: float }),
      })
      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        setError(data.error ?? "Failed to clock in")
        return
      }
      if (canPickBranch && branchId) setActiveBranch(branchId)
      onSuccess()
    })
  }

  return (
    /* Full-screen mandatory gate — not dismissible */
    <div className="fixed inset-0 z-50 bg-[var(--pt-bg)] flex items-center justify-center px-4">
      <div className="bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] shadow-sm p-8 w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 rounded-full bg-[var(--pt-green-50)] flex items-center justify-center mb-3">
            <Clock size={22} className="text-[var(--pt-green)]" />
          </div>
          <h2 className="text-lg font-bold text-center">Start your shift</h2>
          <p className="text-sm text-[var(--pt-text-secondary)] text-center mt-1">{now}</p>
        </div>

        <div className="space-y-4">
          {canPickBranch && (
            <div>
              <Label htmlFor="shift-branch" className="text-sm font-medium">Branch</Label>
              <select
                id="shift-branch"
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                className="mt-1.5 h-11 w-full rounded-lg border border-[var(--pt-border)] px-3 bg-[var(--pt-surface)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pt-green)]"
              >
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <p className="text-xs text-[var(--pt-text-secondary)] mt-1">Sales and cash for this shift are recorded at this branch.</p>
            </div>
          )}
          <div>
            <Label htmlFor="float" className="text-sm font-medium">
              Opening float (KES)
            </Label>
            <Input
              id="float"
              type="number"
              min="0"
              step="50"
              placeholder="0"
              value={openingFloat}
              onChange={(e) => setOpeningFloat(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleClockIn()}
              className="mt-1.5 h-11 text-lg font-semibold"
              autoFocus
            />
            {openingFloat && !isNaN(parseFloat(openingFloat)) && (
              <p className="text-xs text-[var(--pt-text-secondary)] mt-1">
                {formatKES(parseFloat(openingFloat))}
              </p>
            )}
          </div>

          {error && (
            <p className="text-sm text-[var(--pt-red)] bg-[var(--pt-red-50)] px-3 py-2 rounded-lg">
              {error}
            </p>
          )}

          <Button
            onClick={handleClockIn}
            disabled={isPending}
            className="w-full h-11 bg-[var(--pt-green)] hover:bg-[var(--pt-green-600)] text-white font-semibold"
          >
            {isPending ? "Starting shift…" : "Start shift"}
          </Button>

          <Link
            href="/dashboard"
            className="w-full h-11 flex items-center justify-center gap-1.5 rounded-md border border-[var(--pt-border)] text-sm font-medium text-[var(--pt-text-secondary)] hover:bg-[var(--pt-muted-strong)] transition-colors"
          >
            <ArrowLeft size={15} /> Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
