"use client"

import { useState } from "react"
import { toast } from "sonner"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Banknote, CheckCircle2, Clock, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { postJson } from "@/lib/api/fetcher"
import { useSessionStore } from "@/lib/store/sessionStore"
import type { AddonCode } from "@pharmatrack/core"

// Settings → Add-ons (ADR-021). The owner requests an add-on and pays;
// PharmaTrack switches it on once the payment arrives. While it's active,
// owners/managers choose which branches pay at a cashier station.

export const ADDONS_KEY = ["settingsAddons"]

export interface AddonsResponse {
  addons: Array<{
    code: AddonCode; name: string; price_kes_month: number
    status: "none" | "requested" | "active" | "lapsed" | "cancelled"
    paid_until: string | null; requested_at: string | null
  }>
  paymentNumber: string | null
}

const ABOUT: Record<AddonCode, string> = {
  cashier_station:
    "Order desks serve customers and send their orders to one cashier, who takes the money (cash, M-Pesa or card) and hands the goods over. One cash drawer per branch, and every payment traced to the person who took it.",
}

const day = (ymd: string) => new Date(`${ymd}T12:00:00+03:00`).toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" })

export function AddonsPanel() {
  const qc = useQueryClient()
  const permissions = useSessionStore((s) => s.permissions)
  const canRequest = permissions.includes("billing.manage")
  const canBranches = permissions.includes("branches.manage") || permissions.includes("settings.organization")
  const { data, isLoading } = useQuery<AddonsResponse>({
    queryKey: ADDONS_KEY,
    queryFn: async () => {
      const r = await fetch("/api/settings/addons")
      if (!r.ok) throw new Error("Couldn't load add-ons")
      return r.json() as Promise<AddonsResponse>
    },
  })
  const [note, setNote] = useState("")
  const [sending, setSending] = useState(false)

  async function request(code: AddonCode) {
    setSending(true)
    try {
      await postJson("/api/settings/addons", { code, note: note.trim() || undefined })
      toast.success("Request sent — we'll switch it on as soon as your payment arrives.")
      setNote("")
      void qc.invalidateQueries({ queryKey: ADDONS_KEY })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send the request")
    } finally {
      setSending(false)
    }
  }

  if (isLoading) return <div className="max-w-2xl h-40 rounded-xl bg-[var(--pt-muted-strong)] animate-pulse" />
  if (!data || data.addons.length === 0) return <p className="text-sm text-[var(--pt-text-secondary)]">No add-ons are available right now.</p>

  return (
    <div className="max-w-2xl space-y-5">
      {data.addons.map((a) => (
        <section key={a.code} className="bg-[var(--pt-surface)] rounded-xl border border-[var(--pt-border)] p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold">{a.name}</h3>
              <p className="text-sm text-[var(--pt-text-secondary)]">KES {a.price_kes_month.toLocaleString("en-KE")} / month for the whole pharmacy, any number of branches</p>
            </div>
            <StatusPill status={a.status} paidUntil={a.paid_until} />
          </div>
          <p className="mt-3 text-sm">{ABOUT[a.code]}</p>

          {(a.status === "none" || a.status === "cancelled" || a.status === "lapsed" || a.status === "active") && canRequest && (
            <div className="mt-4 rounded-lg bg-[var(--pt-muted)] p-4 space-y-3 text-sm">
              <p className="font-semibold flex items-center gap-2"><Banknote size={16} />{a.status === "active" ? "Renew" : a.status === "lapsed" ? "Renew to switch it back on" : "How to get it"}</p>
              <ol className="list-decimal pl-5 space-y-1 text-[var(--pt-text-secondary)]">
                <li>Send KES {a.price_kes_month.toLocaleString("en-KE")} per month{data.paymentNumber ? <> by M-Pesa to <strong className="text-[var(--pt-text)]">{data.paymentNumber}</strong></> : " to PharmaTrack"}, with your pharmacy&apos;s name.</li>
                <li>Tell us below (add the M-Pesa code if you have it).</li>
                <li>We switch it on as soon as the payment arrives, and email you.</li>
              </ol>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="M-Pesa code, months paid, anything we should know (optional)" />
                <Button onClick={() => void request(a.code)} disabled={sending}>
                  {sending ? <Loader2 size={16} className="animate-spin" /> : a.status === "active" || a.status === "lapsed" ? "I've paid — renew" : "I've paid — switch it on"}
                </Button>
              </div>
            </div>
          )}
          {a.status === "requested" && (
            <p className="mt-4 text-sm rounded-lg bg-amber-50 text-amber-900 px-3 py-2 flex items-center gap-2">
              <Clock size={15} />Request received. We&apos;ll switch it on once your payment arrives.
            </p>
          )}
          {a.code === "cashier_station" && a.status === "active" && canBranches && <StationBranches />}
        </section>
      ))}
    </div>
  )
}

function StatusPill({ status, paidUntil }: { status: AddonsResponse["addons"][number]["status"]; paidUntil: string | null }) {
  const [cls, text] =
    status === "active" ? ["bg-[var(--pt-green-50)] text-[var(--pt-green-600)]", paidUntil ? `Active until ${day(paidUntil)}` : "Active"]
    : status === "requested" ? ["bg-amber-50 text-amber-900", "Waiting for payment"]
    : status === "lapsed" ? ["bg-[var(--pt-red-50)] text-[var(--pt-red)]", `Ended ${paidUntil ? day(paidUntil) : ""}`]
    : ["bg-[var(--pt-muted)] text-[var(--pt-text-secondary)]", "Not active"]
  return <span className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}>{status === "active" && <CheckCircle2 size={13} />}{text}</span>
}

interface StationBranch { id: string; name: string; is_active: boolean; enabled: boolean; hold_minutes: number; direct_sale: boolean }

function StationBranches() {
  const qc = useQueryClient()
  const key = ["stationBranches"]
  const { data } = useQuery<{ branches: StationBranch[] }>({
    queryKey: key,
    queryFn: async () => {
      const r = await fetch("/api/settings/addons/branches")
      if (!r.ok) throw new Error("Couldn't load branches")
      return r.json() as Promise<{ branches: StationBranch[] }>
    },
  })
  async function save(branchId: string, patch: Partial<Pick<StationBranch, "enabled" | "hold_minutes" | "direct_sale">>) {
    try {
      const r = await fetch("/api/settings/addons/branches", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ branch_id: branchId, ...patch }),
      })
      const json = (await r.json()) as { error?: string }
      if (!r.ok) throw new Error(json.error ?? "Couldn't save")
      void qc.invalidateQueries({ queryKey: key })
      void qc.invalidateQueries({ queryKey: ["cashierStation"] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save")
    }
  }
  return (
    <div className="mt-5">
      <h4 className="text-sm font-semibold">Branches that pay at a cashier</h4>
      <p className="text-xs text-[var(--pt-text-secondary)]">Tills in these branches become order desks or the cashier. Other branches sell as before.</p>
      <div className="mt-3 divide-y divide-[var(--pt-border)] rounded-lg border border-[var(--pt-border)]">
        {(data?.branches ?? []).filter((b) => b.is_active).map((b) => (
          <div key={b.id} className="p-3 space-y-2">
            <label className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">{b.name}</span>
              <Switch checked={b.enabled} onCheckedChange={(v) => void save(b.id, { enabled: v })} aria-label={`Cashier station at ${b.name}`} />
            </label>
            {b.enabled && (
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[var(--pt-text-secondary)]">
                <label className="flex items-center gap-2">
                  Hold stock for
                  <select
                    value={b.hold_minutes}
                    onChange={(e) => void save(b.id, { hold_minutes: Number(e.target.value) })}
                    className="rounded-md border border-[var(--pt-border)] bg-[var(--pt-surface)] px-2 py-1 text-[var(--pt-text)]"
                  >
                    {[10, 15, 20, 30, 45, 60, 90, 120].map((m) => <option key={m} value={m}>{m} min</option>)}
                  </select>
                </label>
                <label className="flex items-center gap-2">
                  <Switch checked={b.direct_sale} onCheckedChange={(v) => void save(b.id, { direct_sale: v })} />
                  Order desks may also take payment
                </label>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
