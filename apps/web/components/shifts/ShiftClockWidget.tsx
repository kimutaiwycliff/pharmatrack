"use client"

import { useEffect, useState } from "react"
import { Clock, LogIn, LogOut, Loader2, AlertTriangle } from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { useActiveShift } from "@/lib/hooks/useActiveShift"
import { useSessionStore } from "@/lib/store/sessionStore"
import { useUIStore } from "@/lib/store/uiStore"
import { varianceSeverity } from "@/lib/shifts/variance"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

function elapsed(from: string) {
  const ms = Date.now() - new Date(from).getTime()
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

interface OpenModalProps {
  branchId: string
  onClose: () => void
  onOpened: () => void
}

function OpenShiftModal({ branchId, onClose, onOpened }: OpenModalProps) {
  const [float, setFloat] = useState("")
  const [loading, setLoading] = useState(false)

  async function submit() {
    const opening_float = parseFloat(float || "0")
    if (isNaN(opening_float) || opening_float < 0) {
      toast.error("Enter a valid opening float")
      return
    }
    setLoading(true)
    try {
      const res = await fetch("/api/shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch_id: branchId, opening_float }),
      })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(json.error ?? "Failed to open shift")
      toast.success("Shift opened")
      onOpened()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-[var(--pt-surface)] rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
        <h2 className="text-lg font-bold mb-1">Open Shift</h2>
        <p className="text-sm text-[var(--pt-text-secondary)] mb-5">
          Enter the opening cash float for this shift.
        </p>
        <label className="block text-xs font-semibold text-[var(--pt-text-secondary)] mb-1.5 uppercase tracking-wide">
          Opening Float (KES)
        </label>
        <Input
          type="number"
          min="0"
          step="50"
          placeholder="0.00"
          value={float}
          onChange={(e) => setFloat(e.target.value)}
          className="h-11 mb-5"
          autoFocus
        />
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={submit} disabled={loading}>
            {loading ? <Loader2 size={15} className="animate-spin" /> : "Open Shift"}
          </Button>
        </div>
      </div>
    </div>
  )
}

interface CloseModalProps {
  shiftId: string
  openingFloat: number
  onClose: () => void
  onClosed: () => void
}

function CloseShiftModal({ shiftId, openingFloat, onClose, onClosed }: CloseModalProps) {
  const [cash, setCash] = useState("")
  const [notes, setNotes] = useState("")
  const [loading, setLoading] = useState(false)
  const [cashSales, setCashSales] = useState<number | null>(null)
  const [acknowledged, setAcknowledged] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch("/api/shifts/active")
      .then((res) => (res.ok ? res.json() : { cashSales: 0 }))
      .then((json: { cashSales?: number }) => {
        if (!cancelled) setCashSales(json.cashSales ?? 0)
      })
      .catch(() => {
        if (!cancelled) setCashSales(0)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const closingCash = parseFloat(cash)
  const hasValidCash = !isNaN(closingCash) && closingCash >= 0
  const expected = cashSales == null ? null : openingFloat + cashSales
  const variance = hasValidCash && expected != null ? closingCash - expected : null
  const severity = varianceSeverity(variance) ?? "ok"
  const needsAck = variance != null && severity === "serious"

  async function submit() {
    if (!hasValidCash) {
      toast.error("Enter the closing cash amount")
      return
    }
    if (needsAck && !acknowledged) {
      toast.error("Please confirm the large variance before submitting")
      return
    }
    setLoading(true)
    try {
      const res = await fetch("/api/shifts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shift_id: shiftId, closing_cash: closingCash, notes: notes || undefined }),
      })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(json.error ?? "Failed to close shift")
      toast.success("Shift closed")
      onClosed()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-[var(--pt-surface)] rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
        <h2 className="text-lg font-bold mb-1">Close Shift</h2>
        <p className="text-sm text-[var(--pt-text-secondary)] mb-5">
          Opening float was KES {openingFloat.toLocaleString("en-KE")}. Count the cash drawer and enter the closing amount.
        </p>
        <label className="block text-xs font-semibold text-[var(--pt-text-secondary)] mb-1.5 uppercase tracking-wide">
          Closing Cash (KES)
        </label>
        <Input
          type="number"
          min="0"
          step="50"
          placeholder="0.00"
          value={cash}
          onChange={(e) => {
            setCash(e.target.value)
            setAcknowledged(false)
          }}
          className="h-11 mb-3"
          autoFocus
        />

        {hasValidCash && expected != null && (
          <div
            className={`rounded-xl p-3 mb-4 text-sm ${
              severity === "ok"
                ? "bg-[var(--pt-green-50)] text-[var(--pt-green-700)]"
                : severity === "warn"
                  ? "bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300"
                  : "bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300"
            }`}
          >
            <div className="flex justify-between">
              <span>Expected cash</span>
              <span className="font-semibold tabular-nums">KES {expected.toLocaleString("en-KE")}</span>
            </div>
            <div className="flex justify-between mt-1">
              <span className="flex items-center gap-1">
                {severity !== "ok" && <AlertTriangle size={13} />}
                Variance
              </span>
              <span className="font-semibold tabular-nums">
                {variance! > 0 ? "+" : ""}KES {variance!.toLocaleString("en-KE")}
              </span>
            </div>
            {severity === "serious" && (
              <p className="mt-2 text-xs">
                This is a large discrepancy — please recount the drawer. If it&apos;s correct, note why below and confirm.
              </p>
            )}
          </div>
        )}

        <label className="block text-xs font-semibold text-[var(--pt-text-secondary)] mb-1.5 uppercase tracking-wide">
          Notes {severity === "serious" ? "(explain the variance)" : "(optional)"}
        </label>
        <Input
          placeholder="Any handover notes…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="h-11 mb-3"
        />

        {needsAck && (
          <label className="flex items-start gap-2 mb-5 text-sm text-[var(--pt-text-secondary)] cursor-pointer">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-0.5"
            />
            I&apos;ve recounted the drawer and confirm this variance is correct.
          </label>
        )}
        {!needsAck && <div className="mb-5" />}

        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            className="flex-1 bg-[var(--pt-red)] hover:bg-red-700 text-white border-0"
            onClick={submit}
            disabled={loading || (needsAck && !acknowledged)}
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : "End Shift"}
          </Button>
        </div>
      </div>
    </div>
  )
}

export function ShiftClockWidget() {
  const profile = useSessionStore((s) => s.profile)
  const branchId = useUIStore((s) => s.activeBranchId)
  const queryClient = useQueryClient()
  const { data: shift, isLoading } = useActiveShift(profile?.id)

  const [modal, setModal] = useState<"open" | "close" | null>(null)

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["activeShift"] })
    void queryClient.invalidateQueries({ queryKey: ["shifts"] })
    setModal(null)
  }

  if (isLoading) return null
  if (!branchId) return null

  return (
    <>
      {shift ? (
        <button
          onClick={() => setModal("close")}
          className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--pt-border)] text-xs font-semibold text-[var(--pt-text-secondary)] hover:bg-[var(--pt-muted)] transition-colors"
          title="End shift"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--pt-green)] animate-pulse" />
          <Clock size={12} />
          {elapsed(shift.clocked_in_at)}
          <LogOut size={12} />
        </button>
      ) : (
        <button
          onClick={() => setModal("open")}
          className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--pt-border)] text-xs font-semibold text-[var(--pt-text-secondary)] hover:bg-[var(--pt-muted)] transition-colors"
          title="Open shift"
        >
          <LogIn size={12} />
          Start Shift
        </button>
      )}

      {modal === "open" && (
        <OpenShiftModal
          branchId={branchId}
          onClose={() => setModal(null)}
          onOpened={invalidate}
        />
      )}
      {modal === "close" && shift && (
        <CloseShiftModal
          shiftId={shift.id}
          openingFloat={shift.opening_float}
          onClose={() => setModal(null)}
          onClosed={invalidate}
        />
      )}
    </>
  )
}
