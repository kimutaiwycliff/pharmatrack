"use client"

import { useState, useTransition } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useQueryClient } from "@tanstack/react-query"
import type { Shift } from "@pharmatrack/types"

interface ClockOutDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  shift: Shift
  onSuccess: () => void
}

function kes(n: number) {
  return new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES" }).format(n)
}

function formatDuration(from: string) {
  const ms = Date.now() - new Date(from).getTime()
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return `${h}h ${m}m`
}

export function ClockOutDialog({ open, onOpenChange, shift, onSuccess }: ClockOutDialogProps) {
  const [closingCash, setClosingCash] = useState("")
  const [error, setError] = useState("")
  const [isPending, startTransition] = useTransition()
  const queryClient = useQueryClient()

  const duration = formatDuration(shift.clocked_in_at)
  const closing = parseFloat(closingCash)
  const variance = !isNaN(closing) ? closing - shift.opening_float : null

  function handleClockOut() {
    if (isNaN(closing) || closing < 0) {
      setError("Enter a valid closing cash amount")
      return
    }
    setError("")
    startTransition(async () => {
      const res = await fetch(`/api/shifts`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shift_id: shift.id, closing_cash: closing }),
      })
      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        setError(data.error ?? "Failed to end shift")
        return
      }
      await queryClient.invalidateQueries({ queryKey: ["activeShift"] })
      onSuccess()
    })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => onOpenChange(o)}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>End shift</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[var(--pt-text-secondary)]">Duration</span>
              <span className="font-semibold">{duration}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--pt-text-secondary)]">Opening float</span>
              <span className="font-semibold">{kes(shift.opening_float)}</span>
            </div>
          </div>

          <div>
            <Label htmlFor="closing" className="text-sm font-medium">
              Closing cash count (KES)
            </Label>
            <Input
              id="closing"
              type="number"
              min="0"
              step="50"
              placeholder="0"
              value={closingCash}
              onChange={(e) => setClosingCash(e.target.value)}
              className="mt-1.5 h-11 text-lg font-semibold"
              autoFocus
            />
          </div>

          {variance !== null && (
            <div
              className={[
                "flex justify-between items-center px-4 py-3 rounded-lg text-sm font-semibold",
                variance === 0
                  ? "bg-[var(--pt-green-50)] text-[var(--pt-green-600)]"
                  : variance > 0
                    ? "bg-blue-50 text-blue-700"
                    : "bg-[var(--pt-red-50)] text-[var(--pt-red)]",
              ].join(" ")}
            >
              <span>Variance</span>
              <span>
                {variance >= 0 ? "+" : ""}
                {kes(variance)}
              </span>
            </div>
          )}

          {error && (
            <p className="text-sm text-[var(--pt-red)] bg-[var(--pt-red-50)] px-3 py-2 rounded-lg">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
              Cancel
            </Button>
            <Button
              onClick={handleClockOut}
              disabled={isPending || !closingCash}
              className="flex-1 bg-[var(--pt-red)] hover:bg-red-600 text-white font-semibold"
            >
              {isPending ? "Ending…" : "End shift"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
