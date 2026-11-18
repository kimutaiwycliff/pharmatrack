"use client"

import { useState } from "react"
import { CreditCard } from "lucide-react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { formatKES } from "@/lib/store/cartStore"

// Card at the cashier station: no card API — the cashier runs the terminal,
// then types its approval code so the payment can be traced (ADR-021).
export function CardModal({ open, total, submitting, onClose, onConfirm }: {
  open: boolean; total: number; submitting?: boolean; onClose: () => void; onConfirm: (approvalCode: string) => void
}) {
  const [code, setCode] = useState("")
  const ok = code.trim().length >= 2
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent showCloseButton={false} className="max-w-[420px] p-0 gap-0 overflow-hidden rounded-2xl">
        <div className="flex items-center gap-3 px-6 py-5 border-b border-[var(--pt-border)]">
          <div className="w-9 h-9 rounded-lg bg-[var(--pt-green-50)] flex items-center justify-center text-[var(--pt-green-600)]"><CreditCard size={18} /></div>
          <h2 className="text-lg font-bold">Card payment</h2>
        </div>
        <form
          className="p-6 space-y-4"
          onSubmit={(e) => { e.preventDefault(); if (ok && !submitting) onConfirm(code.trim()) }}
        >
          <div className="text-center">
            <div className="text-sm text-[var(--pt-text-secondary)]">Charge on the card terminal</div>
            <div className="text-3xl font-bold tabular-nums">{formatKES(total)}</div>
          </div>
          <label className="block text-sm font-medium">
            Approval code from the terminal slip
            <Input value={code} onChange={(e) => setCode(e.target.value)} autoFocus maxLength={40} className="mt-1.5" placeholder="e.g. 042317" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={!ok || submitting}>Card approved</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
