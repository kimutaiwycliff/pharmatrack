"use client"

import { useEffect, useRef, useState } from "react"
import { CheckCircle2, RotateCcw, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatKES } from "@/lib/store/cartStore"
import { STK_GIVE_UP_MS, useStkStatus } from "@/lib/mpesa/useStkStatus"

// After an STK push: wait for Safaricom to confirm the payment, then hand the
// receipt back so the sale completes by itself. Used by the M-Pesa and Split
// payment windows. Before this the cashier pressed "Confirm received" on trust.

export function StkWaitPanel({ checkoutRequestId, phone, amount, submitting, onPaid, onResend, onManual }: {
  checkoutRequestId: string
  /** As typed (07…/7…/2547…), for "Prompt sent to …". */
  phone: string
  amount: number
  submitting: boolean
  /** Called once, when Safaricom confirms the payment. */
  onPaid: (receipt: string | null) => void
  onResend: () => void
  /** "Paid another way" — continue with a manual (unverified) confirmation. */
  onManual: () => void
}) {
  const [startedAt] = useState(() => Date.now())
  const { data, isError } = useStkStatus(checkoutRequestId, startedAt)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  const elapsed = Math.floor((now - startedAt) / 1000)
  const gaveUp = now - startedAt > STK_GIVE_UP_MS

  // Complete the sale once, as soon as the payment is confirmed.
  const handedOver = useRef(false)
  useEffect(() => {
    if (data?.status !== "paid" || handedOver.current) return
    handedOver.current = true
    const id = setTimeout(() => onPaid(data.receipt), 900) // a beat to see "Paid ✓"
    return () => clearTimeout(id)
  }, [data, onPaid])

  const shownPhone = `+254${phone.replace(/\D/g, "").replace(/^(?:254|0)/, "")}`
  const status = data?.status ?? "pending"

  if (status === "paid") {
    return (
      <div role="status" className="bg-[var(--pt-green-50)] border border-[var(--pt-green)] rounded-xl p-5 text-center space-y-2">
        <CheckCircle2 size={40} className="mx-auto text-[var(--pt-green)]" />
        <p className="text-lg font-bold text-[var(--pt-green-600)]">Paid · {formatKES(data?.amount ?? amount)}</p>
        <p className="text-sm text-[var(--pt-text-secondary)]">
          {data?.receipt ? <>M-Pesa receipt <span className="font-mono font-semibold">{data.receipt}</span></> : "Confirmed by M-Pesa"}
          {" · "}{submitting ? "saving the sale…" : "completing the sale…"}
        </p>
      </div>
    )
  }

  if (status === "cancelled" || status === "failed") {
    return (
      <div role="alert" className="bg-[var(--pt-red-50)] border border-red-200 dark:border-red-500/30 rounded-xl p-5 text-center space-y-3">
        <XCircle size={36} className="mx-auto text-[var(--pt-red)]" />
        <p className="font-bold">Not paid</p>
        <p className="text-sm text-[var(--pt-text-secondary)]">{data?.message}</p>
        <div className="flex gap-2 justify-center flex-wrap">
          <Button size="sm" onClick={onResend} className="gap-1.5 h-10 bg-[var(--pt-green)] hover:bg-[var(--pt-green-600)] text-white">
            <RotateCcw size={14} /> Send the prompt again
          </Button>
          <Button size="sm" variant="outline" onClick={onManual} className="h-10">Customer paid another way</Button>
        </div>
      </div>
    )
  }

  return (
    <div role="status" aria-live="polite" className="bg-[var(--pt-green-50)] border border-[var(--pt-green-100)] rounded-xl p-5 text-center space-y-3">
      <div className="w-14 h-14 rounded-2xl bg-[var(--pt-green)] flex items-center justify-center mx-auto font-black text-white text-lg tracking-tight">M·P</div>
      <div>
        <p className="font-bold">Prompt sent to {shownPhone}</p>
        <p className="text-sm text-[var(--pt-text-secondary)] mt-0.5">
          Ask the customer to enter their M-Pesa PIN. The sale completes by itself once M-Pesa confirms {formatKES(amount)}.
        </p>
      </div>
      {gaveUp || isError ? (
        <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
          {isError ? "Couldn't check with M-Pesa — check the connection." : "No answer from M-Pesa yet."} Check the customer&apos;s M-Pesa SMS, or send the prompt again.
        </p>
      ) : (
        <div className="inline-flex items-center gap-2 bg-[var(--pt-surface)] rounded-full px-4 py-2 text-sm font-semibold tabular-nums">
          <span className="w-2 h-2 rounded-full bg-[var(--pt-green)] animate-pulse" />
          Waiting for payment · {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
        </div>
      )}
      <div className="flex gap-2 justify-center flex-wrap">
        <Button variant="outline" size="sm" onClick={onResend} className="gap-1.5 h-10"><RotateCcw size={14} /> Resend</Button>
        <Button variant="outline" size="sm" onClick={onManual} className="h-10">Customer paid another way</Button>
      </div>
    </div>
  )
}
