"use client"

import { useState } from "react"
import { toast } from "sonner"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2, Puzzle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useConfirm } from "@/components/ui/confirm-dialog"
import type { AddonCode } from "@pharmatrack/core"

// Operator: a tenant's paid add-ons (ADR-021). Add-ons are switched on here
// once the pharmacy's payment has arrived — confirming records the payment in
// the ledger and activates (or extends) the add-on for the months paid.

interface Addon {
  code: AddonCode; name: string; price_kes_month: number
  status: "none" | "requested" | "active" | "lapsed" | "cancelled"
  paid_until: string | null; requested_at: string | null
}

const day = (ymd: string) => new Date(`${ymd}T12:00:00+03:00`).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })

export function AddonsAdminPanel({ orgId }: { orgId: string }) {
  const key = ["platformAddons", orgId]
  const { data } = useQuery<{ addons: Addon[] }>({
    queryKey: key,
    queryFn: async () => {
      const r = await fetch(`/api/platform/tenants/${orgId}/addons`)
      if (!r.ok) throw new Error("Couldn't load add-ons")
      return r.json() as Promise<{ addons: Addon[] }>
    },
  })
  if (!data || data.addons.length === 0) return null
  return (
    <section className="bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] p-5 mb-5 space-y-4">
      <h2 className="font-semibold flex items-center gap-2"><Puzzle size={16} />Add-ons</h2>
      {data.addons.map((a) => <AddonRow key={a.code} orgId={orgId} addon={a} queryKey={key} />)}
    </section>
  )
}

function AddonRow({ orgId, addon: a, queryKey }: { orgId: string; addon: Addon; queryKey: unknown[] }) {
  const qc = useQueryClient()
  const confirm = useConfirm()
  const [months, setMonths] = useState(1)
  const [amount, setAmount] = useState(String(a.price_kes_month))
  const [method, setMethod] = useState("mpesa")
  const [reference, setReference] = useState("")
  const [busy, setBusy] = useState(false)

  async function post(body: Record<string, unknown>) {
    setBusy(true)
    try {
      const r = await fetch(`/api/platform/tenants/${orgId}/addons`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: a.code, ...body }),
      })
      const json = (await r.json()) as { error?: string; paid_until?: string }
      if (!r.ok) throw new Error(json.error ?? "Failed")
      toast.success(json.paid_until ? `${a.name} active until ${day(json.paid_until)}` : `${a.name} switched off`)
      setReference("")
      void qc.invalidateQueries({ queryKey })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed")
    } finally {
      setBusy(false)
    }
  }

  const state =
    a.status === "active" ? (a.paid_until ? `Active until ${day(a.paid_until)}` : "Active (no end date)")
    : a.status === "requested" ? `Requested ${a.requested_at ? new Date(a.requested_at).toLocaleString("en-KE", { timeZone: "Africa/Nairobi" }) : ""} — waiting for payment`
    : a.status === "lapsed" ? `Lapsed on ${a.paid_until ? day(a.paid_until) : "—"}`
    : a.status === "cancelled" ? "Switched off" : "Not requested"

  return (
    <div className="rounded-lg border border-[var(--pt-border)] p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-medium">{a.name} <span className="text-xs text-[var(--pt-text-secondary)]">· KES {a.price_kes_month.toLocaleString("en-KE")}/month</span></div>
          <div className={`text-sm ${a.status === "requested" ? "text-amber-700 font-semibold" : "text-[var(--pt-text-secondary)]"}`}>{state}</div>
          {a.status === "active" && a.requested_at && <div className="text-xs text-amber-700">Renewal requested</div>}
        </div>
        {(a.status === "active" || a.status === "lapsed" || a.status === "requested") && (
          <Button variant="outline" size="sm" disabled={busy} onClick={async () => {
            if (await confirm(`Switch ${a.name} off for this pharmacy now? Orders already sent can still be paid for.`, { title: "Switch off add-on", confirmLabel: "Switch off" })) void post({ action: "revoke" })
          }}>Switch off</Button>
        )}
      </div>
      <form
        className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-end"
        onSubmit={(e) => { e.preventDefault(); void post({ action: "confirm", months, amount_kes: Number(amount), method, reference: reference.trim() || undefined }) }}
      >
        <div>
          <Label className="text-xs">Months paid</Label>
          <Input type="number" min={1} max={12} value={months} onChange={(e) => {
            const m = Math.max(1, Math.min(12, Number(e.target.value) || 1)); setMonths(m); setAmount(String(m * a.price_kes_month))
          }} />
        </div>
        <div>
          <Label className="text-xs">Amount (KES)</Label>
          <Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Method</Label>
          <select value={method} onChange={(e) => setMethod(e.target.value)} className="w-full h-9 rounded-md border border-[var(--pt-border)] bg-[var(--pt-surface)] px-2 text-sm">
            <option value="mpesa">M-Pesa</option><option value="bank">Bank</option><option value="cash">Cash</option><option value="card">Card</option><option value="waived">Waived (free)</option>
          </select>
        </div>
        <div>
          <Label className="text-xs">Reference</Label>
          <Input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={60} placeholder="M-Pesa code" />
        </div>
        <Button type="submit" disabled={busy || !(Number(amount) >= 0)}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : a.status === "active" ? "Confirm & extend" : "Confirm payment & switch on"}
        </Button>
      </form>
    </div>
  )
}
