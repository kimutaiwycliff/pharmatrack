"use client"

import { useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { ArrowLeft, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface Plan { id: string; code: string; name: string; price_kes: number; interval: string }
interface Sub {
  id: string; status: string; plan_id: string | null
  trial_ends_at: string | null; current_period_end: string | null
}
interface Payment { id: string; amount_kes: number; method: string | null; reference: string | null; period_end: string | null; created_at: string }
interface TenantDetail {
  tenant: { id: string; name: string; email: string | null; phone: string | null; created_at: string; subscriptions: Sub[] }
  branch_count: number; staff_count: number; plans: Plan[]; payments: Payment[]
}

const selectCls = "w-full h-10 rounded-lg border border-[var(--pt-border)] px-3 text-sm bg-[var(--pt-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--pt-green)]"
const dateOnly = (iso: string | null) => (iso ? iso.slice(0, 10) : "")

export default function TenantDetailPage() {
  const { orgId } = useParams<{ orgId: string }>()
  const qc = useQueryClient()
  const [saving, setSaving] = useState(false)

  const { data, isLoading } = useQuery<TenantDetail>({
    queryKey: ["tenant", orgId],
    queryFn: async () => {
      const res = await fetch(`/api/platform/tenants/${orgId}`)
      if (!res.ok) throw new Error("Failed to load tenant")
      return res.json() as Promise<TenantDetail>
    },
  })

  const sub = data?.tenant.subscriptions?.[0]
  const [status, setStatus] = useState<string>("")
  const [planId, setPlanId] = useState<string>("")
  const [periodEnd, setPeriodEnd] = useState<string>("")
  const [trialEnds, setTrialEnds] = useState<string>("")
  const [synced, setSynced] = useState(false)
  if (sub && !synced) {
    setSynced(true)
    setStatus(sub.status)
    setPlanId(sub.plan_id ?? "")
    setPeriodEnd(dateOnly(sub.current_period_end))
    setTrialEnds(dateOnly(sub.trial_ends_at))
  }

  // Payment form
  const [amount, setAmount] = useState("")
  const [method, setMethod] = useState("mpesa")
  const [reference, setReference] = useState("")
  const [payPeriodEnd, setPayPeriodEnd] = useState("")
  const [paying, setPaying] = useState(false)

  async function saveSubscription() {
    setSaving(true)
    try {
      const res = await fetch(`/api/platform/tenants/${orgId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          plan_id: planId || null,
          current_period_end: periodEnd ? new Date(periodEnd).toISOString() : null,
          trial_ends_at: trialEnds ? new Date(trialEnds).toISOString() : null,
        }),
      })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(json.error ?? "Failed")
      toast.success("Subscription updated")
      await qc.invalidateQueries({ queryKey: ["tenant", orgId] })
      await qc.invalidateQueries({ queryKey: ["tenants"] })
    } catch (err) { toast.error(err instanceof Error ? err.message : "Error") }
    finally { setSaving(false) }
  }

  async function logPayment() {
    const amt = parseFloat(amount)
    if (isNaN(amt) || amt <= 0) { toast.error("Enter a valid amount"); return }
    setPaying(true)
    try {
      const res = await fetch(`/api/platform/tenants/${orgId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount_kes: amt, method, reference: reference || undefined, period_end: payPeriodEnd || undefined, activate: true }),
      })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(json.error ?? "Failed")
      toast.success("Payment recorded")
      setAmount(""); setReference(""); setPayPeriodEnd("")
      await qc.invalidateQueries({ queryKey: ["tenant", orgId] })
      await qc.invalidateQueries({ queryKey: ["tenants"] })
    } catch (err) { toast.error(err instanceof Error ? err.message : "Error") }
    finally { setPaying(false) }
  }

  if (isLoading || !data) {
    return <div className="flex items-center gap-2 text-[var(--pt-text-secondary)]"><Loader2 size={16} className="animate-spin" /> Loading…</div>
  }

  const t = data.tenant
  return (
    <div className="max-w-3xl">
      <Link href="/platform" className="inline-flex items-center gap-1.5 text-sm text-[var(--pt-text-secondary)] hover:text-[var(--pt-text)] mb-4"><ArrowLeft size={15} /> All tenants</Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">{t.name}</h1>
        <p className="text-sm text-[var(--pt-text-secondary)] mt-0.5">
          {t.email ?? "—"} · {data.branch_count} branches · {data.staff_count} staff · since {new Date(t.created_at).toLocaleDateString("en-KE", { month: "short", year: "numeric" })}
        </p>
      </div>

      {/* Subscription */}
      <section className="bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] p-5 mb-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--pt-text-secondary)] mb-4">Subscription</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-sm font-medium">Status</Label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={`mt-1.5 ${selectCls}`}>
              {["trialing", "active", "past_due", "suspended", "cancelled"].map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
            </select>
          </div>
          <div>
            <Label className="text-sm font-medium">Plan</Label>
            <select value={planId} onChange={(e) => setPlanId(e.target.value)} className={`mt-1.5 ${selectCls}`}>
              <option value="">—</option>
              {data.plans.map((p) => <option key={p.id} value={p.id}>{p.name} (KES {p.price_kes}/{p.interval})</option>)}
            </select>
          </div>
          <div>
            <Label className="text-sm font-medium">Paid until</Label>
            <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className="mt-1.5 h-10" />
          </div>
          <div>
            <Label className="text-sm font-medium">Trial ends</Label>
            <Input type="date" value={trialEnds} onChange={(e) => setTrialEnds(e.target.value)} className="mt-1.5 h-10" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <Button onClick={saveSubscription} disabled={saving} className="gap-1.5">{saving && <Loader2 size={14} className="animate-spin" />} Save</Button>
          {status !== "suspended"
            ? <Button variant="outline" onClick={() => setStatus("suspended")} className="text-[var(--pt-red)] border-[var(--pt-red)]">Suspend…</Button>
            : <Button variant="outline" onClick={() => setStatus("active")}>Reactivate…</Button>}
          <span className="text-xs text-[var(--pt-text-tertiary)]">remember to Save</span>
        </div>
      </section>

      {/* Record payment */}
      <section className="bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] p-5 mb-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--pt-text-secondary)] mb-4">Record payment</h2>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div><Label className="text-sm font-medium">Amount (KES)</Label><Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1.5 h-10" /></div>
          <div><Label className="text-sm font-medium">Method</Label>
            <select value={method} onChange={(e) => setMethod(e.target.value)} className={`mt-1.5 ${selectCls}`}>
              {["mpesa", "bank", "cash", "card", "other"].map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div><Label className="text-sm font-medium">Reference</Label><Input value={reference} onChange={(e) => setReference(e.target.value)} className="mt-1.5 h-10" /></div>
          <div><Label className="text-sm font-medium">Covers until</Label><Input type="date" value={payPeriodEnd} onChange={(e) => setPayPeriodEnd(e.target.value)} className="mt-1.5 h-10" /></div>
        </div>
        <p className="text-xs text-[var(--pt-text-tertiary)] mt-2">Recording a payment with a &quot;covers until&quot; date activates the subscription and extends paid-until.</p>
        <Button onClick={logPayment} disabled={paying} size="sm" className="mt-3 gap-1.5">{paying && <Loader2 size={13} className="animate-spin" />} Record payment</Button>
      </section>

      {/* Payment history */}
      <section className="bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] overflow-hidden">
        <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--pt-text-secondary)] px-5 pt-5 pb-3">Payment history</h2>
        {data.payments.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-[var(--pt-text-tertiary)]">No payments recorded</p>
        ) : (
          <div>
            {data.payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-5 py-3 border-t border-[var(--pt-border)] text-sm">
                <div>
                  <span className="font-semibold tabular-nums">KES {Number(p.amount_kes).toLocaleString()}</span>
                  <span className="text-[var(--pt-text-tertiary)] ml-2 text-xs">{p.method ?? "—"}{p.reference ? ` · ${p.reference}` : ""}</span>
                </div>
                <span className="text-xs text-[var(--pt-text-tertiary)]">{new Date(p.created_at).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
