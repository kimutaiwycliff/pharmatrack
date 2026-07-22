"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Loader2, CreditCard, Smartphone, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface Plan { name: string; price_kes: number; interval: string }
interface Sub {
  status: string
  current_period_end: string | null
  trial_ends_at: string | null
  plan: Plan | null
}
interface Payment { id: string; amount_kes: number; method: string | null; reference: string | null; created_at: string; status: string }
interface BillingData { subscription: Sub | null; payments: Payment[]; paystackEnabled: boolean; paymentNumber: string | null }

const STATUS_STYLES: Record<string, string> = {
  trialing: "bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-500/30",
  active: "bg-[var(--pt-green-50)] text-[var(--pt-green-600)] border-[var(--pt-green-100)]",
  past_due: "bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30",
  suspended: "bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 border-red-200 dark:border-red-500/30",
  cancelled: "bg-[var(--pt-muted-strong)] text-[var(--pt-text-secondary)] border-[var(--pt-border)]",
}

const PAYMENT_STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30",
  rejected: "bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 border-red-200 dark:border-red-500/30",
}

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" }) : "—")

export function BillingPanel() {
  const qc = useQueryClient()
  const [paying, setPaying] = useState(false)
  const [mpesaRef, setMpesaRef] = useState("")
  const [claiming, setClaiming] = useState(false)
  const { data, isLoading } = useQuery<BillingData>({
    queryKey: ["billing"],
    queryFn: async () => {
      const res = await fetch("/api/billing")
      if (!res.ok) throw new Error("Failed to load billing")
      return res.json() as Promise<BillingData>
    },
  })

  async function pay() {
    setPaying(true)
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST" })
      const json = (await res.json()) as { authorization_url?: string; error?: string }
      if (!res.ok || !json.authorization_url) throw new Error(json.error ?? "Could not start payment")
      window.location.href = json.authorization_url
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error")
      setPaying(false)
    }
  }

  async function claimPayment() {
    if (!mpesaRef.trim()) { toast.error("Enter the M-Pesa confirmation code"); return }
    setClaiming(true)
    try {
      const res = await fetch("/api/billing/claim-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference: mpesaRef.trim() }),
      })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(json.error ?? "Could not submit payment")
      toast.success("Thanks! We'll confirm and activate your subscription shortly.")
      setMpesaRef("")
      await qc.invalidateQueries({ queryKey: ["billing"] })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error")
    } finally {
      setClaiming(false)
    }
  }

  if (isLoading || !data) {
    return <div className="max-w-xl flex items-center gap-2 text-[var(--pt-text-secondary)] text-sm"><Loader2 size={16} className="animate-spin" /> Loading…</div>
  }

  const sub = data.subscription
  const status = sub?.status ?? "none"
  const pendingClaim = data.payments.find((p) => p.status === "pending")

  return (
    <div className="max-w-xl space-y-5">
      <div className="bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">{sub?.plan?.name ?? "No plan"}</p>
            {sub?.plan && <p className="text-xs text-[var(--pt-text-secondary)] mt-0.5">KES {Number(sub.plan.price_kes).toLocaleString()} / {sub.plan.interval}</p>}
          </div>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${STATUS_STYLES[status] ?? STATUS_STYLES.cancelled}`}>{status.replace("_", " ")}</span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-[var(--pt-text-tertiary)]">Paid until</p>
            <p className="font-medium tabular-nums">{fmt(sub?.current_period_end ?? null)}</p>
          </div>
          {sub?.trial_ends_at && (
            <div>
              <p className="text-[11px] uppercase tracking-wide text-[var(--pt-text-tertiary)]">Trial ends</p>
              <p className="font-medium tabular-nums">{fmt(sub.trial_ends_at)}</p>
            </div>
          )}
        </div>

        {data.paystackEnabled && (
          <div className="mt-5">
            <Button onClick={pay} disabled={paying} className="gap-1.5">
              {paying ? <Loader2 size={15} className="animate-spin" /> : <CreditCard size={15} />}
              {status === "active" ? "Renew now" : "Pay & activate"}
            </Button>
          </div>
        )}
      </div>

      {data.paymentNumber && (
        <div className="bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] p-5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--pt-text-secondary)] mb-3 flex items-center gap-1.5"><Smartphone size={15} /> Pay via M-Pesa</h2>

          {pendingClaim ? (
            <div className="flex items-start gap-2.5 text-sm bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-lg p-3">
              <Clock size={16} className="mt-0.5 text-amber-600 dark:text-amber-400 shrink-0" />
              <div>
                <p className="font-medium">Payment awaiting confirmation</p>
                <p className="text-[var(--pt-text-secondary)] text-xs mt-0.5">
                  KES {Number(pendingClaim.amount_kes).toLocaleString()} · ref {pendingClaim.reference} · sent {fmt(pendingClaim.created_at)}.
                  We&apos;ll activate your subscription once it&apos;s verified.
                </p>
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm text-[var(--pt-text-secondary)]">
                Send <strong>KES {sub?.plan ? Number(sub.plan.price_kes).toLocaleString() : "—"}</strong> via M-Pesa to <strong className="tabular-nums">{data.paymentNumber}</strong>,
                then enter the confirmation code below. We&apos;ll manually verify and activate your subscription.
              </p>
              <div className="mt-3 flex flex-col sm:flex-row gap-2">
                <div className="flex-1">
                  <Label className="text-sm font-medium sr-only">M-Pesa confirmation code</Label>
                  <Input
                    value={mpesaRef}
                    onChange={(e) => setMpesaRef(e.target.value)}
                    placeholder="e.g. SFH3XJ8K2L"
                    className="h-10"
                  />
                </div>
                <Button onClick={claimPayment} disabled={claiming} className="gap-1.5 shrink-0">
                  {claiming && <Loader2 size={14} className="animate-spin" />} I&apos;ve paid
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      <div className="bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] overflow-hidden">
        <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--pt-text-secondary)] px-5 pt-5 pb-3">Payments</h2>
        {data.payments.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-[var(--pt-text-tertiary)]">No payments yet</p>
        ) : (
          data.payments.map((p) => (
            <div key={p.id} className="flex items-center justify-between px-5 py-3 border-t border-[var(--pt-border)] text-sm">
              <div>
                <span className="font-semibold tabular-nums">KES {Number(p.amount_kes).toLocaleString()}</span>
                <span className="text-[var(--pt-text-tertiary)] ml-2 text-xs">{p.method ?? "—"}{p.reference ? ` · ${p.reference}` : ""}</span>
                {PAYMENT_STATUS_STYLES[p.status] && (
                  <span className={`ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold border ${PAYMENT_STATUS_STYLES[p.status]}`}>{p.status}</span>
                )}
              </div>
              <span className="text-xs text-[var(--pt-text-tertiary)]">{fmt(p.created_at)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
