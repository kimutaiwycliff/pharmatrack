"use client"

import { useState } from "react"
import { toast } from "sonner"
import { CalendarCheck, Loader2, Minus, Plus } from "lucide-react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { coverageFor, daysLeft, endOfNairobiDay, nairobiDay, periodsForAmount } from "@/lib/billing/period"

export interface PeriodDialogSub {
  current_period_end: string | null
  plan: { name: string; price_kes: number; interval: string } | null
}

type Props = {
  orgId: string
  sub: PeriodDialogSub | undefined
  onClose: () => void
  onDone: () => void
} & (
  | { mode: "confirm"; claim: { id: string; amount_kes: number; reference: string | null; created_at: string } }
  | { mode: "record" }
)

const selectCls = "w-full h-10 rounded-lg border border-[var(--pt-border)] px-3 text-sm bg-[var(--pt-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--pt-green)]"
const long = (ymd: string) =>
  endOfNairobiDay(ymd).toLocaleDateString("en-KE", { timeZone: "Africa/Nairobi", weekday: "short", day: "numeric", month: "long", year: "numeric" })

/**
 * Confirm a tenant's payment claim, or record a payment received outside the
 * app. Prefills how many periods the amount buys (amount ÷ plan price) and the
 * resulting "active until" date — stacked on any time they still have left —
 * and lets the operator adjust either before committing. Same maths as the
 * server (lib/billing/period.ts), so the preview is what gets saved.
 */
export function PaymentPeriodDialog(props: Props) {
  const { orgId, sub, onClose, onDone } = props
  const price = sub?.plan?.price_kes ?? null
  const interval = sub?.plan?.interval ?? "monthly"
  const unit = interval === "annual" ? "year" : "month"

  const [amount, setAmount] = useState(props.mode === "confirm" ? String(props.claim.amount_kes) : price ? String(price) : "")
  const [method, setMethod] = useState("mpesa")
  const [reference, setReference] = useState("")
  const [paidOn, setPaidOn] = useState(nairobiDay(new Date()))
  const [periodsTouched, setPeriodsTouched] = useState(false)
  const [manualPeriods, setManualPeriods] = useState(1)
  const [manualEnd, setManualEnd] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const amountNum = Number(amount)
  const periods = periodsTouched ? manualPeriods : periodsForAmount(amountNum, price)
  const paidAt = props.mode === "confirm" ? new Date(props.claim.created_at) : new Date(`${paidOn}T12:00:00+03:00`)
  const auto = coverageFor({ currentPeriodEnd: sub?.current_period_end, paidAt, interval, periods })
  const end = manualEnd ?? auto.end
  const left = daysLeft(endOfNairobiDay(end))
  const stacked = auto.start !== nairobiDay(paidAt)
  const expected = price ? price * periods : null

  function setPeriods(n: number) {
    setPeriodsTouched(true)
    setManualPeriods(Math.min(36, Math.max(1, n)))
    setManualEnd(null) // re-derive the date from the new period count
  }

  async function submit() {
    if (props.mode === "record" && !(amountNum > 0)) { toast.error("Enter the amount received"); return }
    if (end <= nairobiDay(new Date())) { toast.error("Active-until must be in the future"); return }
    setSaving(true)
    try {
      const res = props.mode === "confirm"
        ? await fetch(`/api/platform/tenants/${orgId}/payments/${props.claim.id}`, {
            method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "confirm", period_end: end, periods }),
          })
        : await fetch(`/api/platform/tenants/${orgId}/payments`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ amount_kes: amountNum, method, reference: reference || undefined, paid_on: paidOn, period_end: end, periods }),
          })
      const json = (await res.json()) as { error?: string; owner_notified?: boolean }
      if (!res.ok) throw new Error(json.error ?? "Failed")
      toast.success(`Active until ${long(end)}`, {
        description: json.owner_notified ? "The owner has been emailed a confirmation." : "Owner email not sent (no email on file or email not configured).",
      })
      onDone()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="max-w-md p-6">
        <div className="flex items-center gap-2 mb-1">
          <CalendarCheck size={18} className="text-[var(--pt-green)]" />
          <h2 className="text-lg font-bold">{props.mode === "confirm" ? "Confirm payment" : "Record payment"}</h2>
        </div>
        <p className="text-sm text-[var(--pt-text-secondary)] mb-4">
          {props.mode === "confirm"
            ? <>Claimed KES {props.claim.amount_kes.toLocaleString()}{props.claim.reference ? <> · ref <span className="font-mono">{props.claim.reference}</span></> : null} on {new Date(props.claim.created_at).toLocaleDateString("en-KE", { day: "numeric", month: "short" })}</>
            : <>Payment received outside the app (M-Pesa, bank, cash).</>}
        </p>

        {props.mode === "record" && (
          <div className="grid grid-cols-2 gap-3 mb-3">
            <label className="text-xs font-semibold text-[var(--pt-text-secondary)]">Amount (KES)
              <Input type="number" min={0} value={amount} onChange={(e) => { setAmount(e.target.value); setManualEnd(null) }} className="mt-1 h-10" />
            </label>
            <label className="text-xs font-semibold text-[var(--pt-text-secondary)]">Paid on
              <Input type="date" value={paidOn} max={nairobiDay(new Date())} onChange={(e) => { setPaidOn(e.target.value); setManualEnd(null) }} className="mt-1 h-10" />
            </label>
            <label className="text-xs font-semibold text-[var(--pt-text-secondary)]">Method
              <select value={method} onChange={(e) => setMethod(e.target.value)} className={`mt-1 ${selectCls}`}>
                {["mpesa", "bank", "cash", "card", "other"].map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-[var(--pt-text-secondary)]">Reference
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. TJK4XY2Z9Q" className="mt-1 h-10 font-mono" />
            </label>
          </div>
        )}

        <div className="rounded-xl border border-[var(--pt-border)] p-3 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Covers</p>
              <p className="text-xs text-[var(--pt-text-secondary)]">
                {price ? `${sub?.plan?.name} · KES ${price.toLocaleString()}/${unit}` : "No plan set — pick the period manually"}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setPeriods(periods - 1)} aria-label={`One ${unit} less`} className="w-8 h-8 rounded-md border border-[var(--pt-border)] flex items-center justify-center hover:bg-[var(--pt-muted)]"><Minus size={13} /></button>
              <span className="w-20 text-center text-sm font-semibold tabular-nums">{periods} {unit}{periods === 1 ? "" : "s"}</span>
              <button onClick={() => setPeriods(periods + 1)} aria-label={`One ${unit} more`} className="w-8 h-8 rounded-md border border-[var(--pt-border)] flex items-center justify-center hover:bg-[var(--pt-muted)]"><Plus size={13} /></button>
            </div>
          </div>
          {expected != null && amountNum > 0 && Math.abs(amountNum - expected) >= 1 && (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              {periods} {unit}{periods === 1 ? "" : "s"} is KES {expected.toLocaleString()} — they paid KES {amountNum.toLocaleString()} ({amountNum < expected ? "short" : "over"} by KES {Math.abs(amountNum - expected).toLocaleString()}).
            </p>
          )}
          <label className="block text-xs font-semibold text-[var(--pt-text-secondary)]">
            Active until
            <Input type="date" value={end} min={nairobiDay(new Date())} onChange={(e) => setManualEnd(e.target.value || null)} className="mt-1 h-10" />
          </label>
          {manualEnd && manualEnd !== auto.end && (
            <button onClick={() => setManualEnd(null)} className="text-xs font-semibold text-[var(--pt-green-600)] hover:underline">
              Reset to {long(auto.end)}
            </button>
          )}
        </div>

        <div className="mt-3 rounded-xl bg-[var(--pt-green-50)] px-4 py-3 text-sm">
          <p><span className="font-semibold">Status → Active</span> · next renewal <span className="font-semibold">{long(end)}</span> ({left} day{left === 1 ? "" : "s"})</p>
          <p className="text-xs text-[var(--pt-text-secondary)] mt-1">
            {stacked ? `Added on top of their current period, which runs to ${long(auto.start)}. ` : ""}
            The owner sees this immediately and gets a confirmation email; reminders go out 7 days and 1 day before.
          </p>
        </div>

        <div className="flex gap-2 mt-4">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button className="flex-1 gap-1.5" onClick={submit} disabled={saving}>
            {saving && <Loader2 size={14} className="animate-spin" />}
            {props.mode === "confirm" ? "Confirm & activate" : "Record & activate"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
