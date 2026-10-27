"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { ArrowLeft, Eye, Mail, Send, X } from "lucide-react"
import { Card } from "@/components/platform/insights/ui"
import { GROUP_LABEL, type CampaignGroup, type CampaignStage } from "@/lib/notifications/campaign"

// Platform → Send an update: the setup-guide email, one group at a time.
// Preview each pharmacy's email, send yourself a test, then send. Each
// pharmacy gets it once; sends show under "Follow-ups due" two days later.

interface Recipient {
  org: string; pharmacy: string; group: CampaignGroup; stage: CampaignStage; status: string | null
  owner_email: string | null; owner_name: string | null; sent: boolean
}
interface UpdatesResponse { campaign: string; reply_to: string; recipients: Recipient[] }

const GROUPS: readonly CampaignGroup[] = ["extend", "nudge", "selling"]
const STAGE_LABEL: Record<CampaignStage, string> = {
  no_products: "No products", no_prices: "No prices", no_stock: "No stock", no_sale: "No sale yet", selling: "Selling",
}

async function post(body: unknown) {
  const res = await fetch("/api/platform/updates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? "Something went wrong")
  return data
}

export default function PlatformUpdatesPage() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery<UpdatesResponse>({
    queryKey: ["platform-updates"],
    queryFn: async () => {
      const res = await fetch("/api/platform/updates")
      if (!res.ok) throw new Error("Failed to load")
      return res.json()
    },
  })
  const [group, setGroup] = useState<CampaignGroup>("extend")
  // null = untouched: everyone not yet sent in the group is ticked.
  const [picked, setPicked] = useState<Set<string> | null>(null)
  const [preview, setPreview] = useState<{ subject: string; html: string; to: string | null } | null>(null)
  const [busy, setBusy] = useState<"test" | "send" | null>(null)

  const all = useMemo(() => data?.recipients ?? [], [data])
  const rows = all.filter((r) => r.group === group)
  const sendable = rows.filter((r) => !r.sent && r.owner_email)
  const ticked = picked ?? new Set(sendable.map((r) => r.org))
  const selected = sendable.filter((r) => ticked.has(r.org))

  const switchGroup = (g: CampaignGroup) => { setGroup(g); setPicked(null) }
  const toggle = (org: string) => {
    const n = new Set(ticked)
    if (n.has(org)) n.delete(org)
    else n.add(org)
    setPicked(n)
  }

  async function showPreview(org: string) {
    try { setPreview(await post({ action: "preview", orgId: org })) }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't load the preview") }
  }

  async function sendTest() {
    setBusy("test")
    try {
      const r = await post({ action: "test" })
      toast.success(`Sent 3 test emails (one per group) to ${r.to}`)
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't send the test") }
    finally { setBusy(null) }
  }

  async function sendNow() {
    if (!selected.length) return
    if (!window.confirm(`Send the "${GROUP_LABEL[group].title}" email to ${selected.length} pharmac${selected.length === 1 ? "y" : "ies"}? Each gets it once.`)) return
    setBusy("send")
    try {
      const r = await post({ action: "send", orgIds: selected.map((x) => x.org) })
      const failed = (r.results as Array<{ status: string }>).filter((x) => x.status !== "sent").length
      if (failed) toast.warning(`Sent ${r.sent}; ${failed} didn't go — check the list`)
      else toast.success(`Sent to ${r.sent}. They'll show under "Follow-ups due" in 2 days.`)
      setPicked(null)
      await qc.invalidateQueries({ queryKey: ["platform-updates"] })
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't send") }
    finally { setBusy(null) }
  }

  async function optOut(org: string, name: string) {
    if (!window.confirm(`Mark ${name} as "STOP"? They won't get this or future updates.`)) return
    const res = await fetch("/api/platform/updates", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orgId: org, optOut: true }) })
    if (!res.ok) { toast.error("Couldn't save"); return }
    toast.success(`${name} won't be emailed again`)
    await qc.invalidateQueries({ queryKey: ["platform-updates"] })
  }

  return (
    <div className="max-w-5xl mx-auto">
      <Link href="/platform" className="inline-flex items-center gap-1 text-sm text-[var(--pt-text-secondary)] hover:text-[var(--pt-text)] mb-3">
        <ArrowLeft size={14} /> Pharmacies
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Send an update</h1>
          <p className="text-sm text-[var(--pt-text-secondary)] mt-0.5">
            The setup-guide email. Replies go to {data?.reply_to ?? "…"}. Each pharmacy gets it once.
          </p>
        </div>
        <button onClick={sendTest} disabled={busy !== null || isLoading}
          className="inline-flex items-center gap-2 px-4 h-9 rounded-lg border border-[var(--pt-border)] bg-[var(--pt-surface)] text-sm font-semibold hover:bg-[var(--pt-muted)] disabled:opacity-50">
          <Mail size={16} /> {busy === "test" ? "Sending…" : "Send test to me"}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        {GROUPS.map((g) => {
          const inGroup = all.filter((r) => r.group === g)
          const left = inGroup.filter((r) => !r.sent).length
          return (
            <button key={g} onClick={() => switchGroup(g)}
              className={`text-left rounded-xl border p-4 bg-[var(--pt-surface)] transition-colors ${group === g ? "border-[var(--pt-green)] ring-1 ring-[var(--pt-green)]" : "border-[var(--pt-border)] hover:bg-[var(--pt-muted)]"}`}>
              <div className="text-sm font-semibold">{GROUP_LABEL[g].title}</div>
              <div className="text-2xl font-bold mt-1">{isLoading ? "…" : inGroup.length}</div>
              <div className="text-xs text-[var(--pt-text-secondary)] mt-1">{isLoading ? "" : `${left} not sent yet`}</div>
            </button>
          )
        })}
      </div>

      <Card
        title={GROUP_LABEL[group].title}
        action={
          <button onClick={sendNow} disabled={busy !== null || selected.length === 0}
            className="inline-flex items-center gap-2 px-4 h-9 rounded-lg bg-[var(--pt-green)] text-white text-sm font-semibold hover:bg-[var(--pt-green-600)] disabled:opacity-50">
            <Send size={15} /> {busy === "send" ? "Sending…" : `Send to ${selected.length}`}
          </button>
        }
      >
        <p className="text-sm text-[var(--pt-text-secondary)] mb-3">{GROUP_LABEL[group].description}</p>
        {isLoading ? (
          <div className="h-24 rounded-lg bg-[var(--pt-muted)] animate-pulse" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-[var(--pt-text-secondary)] py-6 text-center">No pharmacies in this group.</p>
        ) : (
          <ul className="divide-y divide-[var(--pt-border)]">
            {rows.map((r) => {
              const canSend = !r.sent && !!r.owner_email
              return (
                <li key={r.org} className="flex items-center gap-3 py-2.5">
                  <input type="checkbox" className="size-4 accent-[var(--pt-green)]" aria-label={`Send to ${r.pharmacy}`}
                    checked={canSend && ticked.has(r.org)} disabled={!canSend} onChange={() => toggle(r.org)} />
                  <div className="min-w-0 flex-1">
                    <Link href={`/platform/${r.org}`} className="font-semibold text-sm hover:text-[var(--pt-green-600)] truncate block">{r.pharmacy}</Link>
                    <div className="text-xs text-[var(--pt-text-secondary)] truncate">
                      {r.owner_email ?? "No owner email"} · {STAGE_LABEL[r.stage]} · <span className="capitalize">{(r.status ?? "ended").replace("_", " ")}</span>
                    </div>
                  </div>
                  {r.sent && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[var(--pt-green-50)] text-[var(--pt-green-600)] border border-[var(--pt-green-100)]">Sent</span>}
                  <button onClick={() => showPreview(r.org)} className="p-2 rounded-lg hover:bg-[var(--pt-muted)]" aria-label={`Preview email for ${r.pharmacy}`} title="Preview">
                    <Eye size={16} />
                  </button>
                  {!r.sent && (
                    <button onClick={() => optOut(r.org, r.pharmacy)} className="text-xs text-[var(--pt-text-secondary)] hover:text-red-600 px-1" title="They replied STOP">
                      Mark STOP
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      {preview && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setPreview(null)}>
          <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-xl bg-[var(--pt-surface)] border border-[var(--pt-border)] shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 p-4 border-b border-[var(--pt-border)]">
              <div className="min-w-0">
                <div className="text-xs text-[var(--pt-text-secondary)]">To: {preview.to ?? "no email"}</div>
                <div className="font-semibold">{preview.subject}</div>
              </div>
              <button onClick={() => setPreview(null)} className="p-1.5 rounded-lg hover:bg-[var(--pt-muted)]" aria-label="Close preview"><X size={16} /></button>
            </div>
            <iframe title="Email preview" sandbox="" srcDoc={preview.html} className="flex-1 min-h-[420px] w-full bg-white rounded-b-xl" />
          </div>
        </div>
      )}
    </div>
  )
}
