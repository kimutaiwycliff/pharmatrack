"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { CalendarClock, Loader2, Mail, MapPin, MessageCircle, Phone, StickyNote, Trash2 } from "lucide-react"
import { normalizeKePhone } from "@pharmatrack/core"
import { Button } from "@/components/ui/button"
import { useConfirm } from "@/components/ui/confirm-dialog"
import type { HealthLevel } from "@/lib/insights/health"
import { ago, Card, shortDate } from "./ui"

// Reach the owner (call / WhatsApp / email with a message ready for the
// situation) and keep a log of every contact + when to follow up.

type Kind = "note" | "call" | "whatsapp" | "email" | "visit"
interface Note { id: string; kind: Kind; body: string; follow_up_on: string | null; created_at: string; author: string | null; author_email: string | null }

const KINDS: Array<{ k: Kind; label: string; icon: React.ComponentType<{ size?: number }> }> = [
  { k: "call", label: "Call", icon: Phone },
  { k: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { k: "email", label: "Email", icon: Mail },
  { k: "visit", label: "Visit", icon: MapPin },
  { k: "note", label: "Note", icon: StickyNote },
]
const KIND_ICON = Object.fromEntries(KINDS.map((k) => [k.k, k.icon])) as Record<Kind, React.ComponentType<{ size?: number }>>

function message(level: HealthLevel, owner: string, pharmacy: string, trialEnding: boolean): { subject: string; text: string } {
  const hi = `Hi ${owner.split(" ")[0] || "there"}, this is the PharmaTrack team.`
  if (level === "never_started" || level === "new") {
    return { subject: `Getting ${pharmacy} started on PharmaTrack`, text: `${hi} I noticed ${pharmacy} hasn't made its first sale on PharmaTrack yet. Can I help you set up your products and stock, or show you the till? It takes about 15 minutes.` }
  }
  if (level === "inactive" || level === "at_risk" || level === "slipping") {
    return { subject: `How is PharmaTrack working for ${pharmacy}?`, text: `${hi} We noticed ${pharmacy} hasn't used PharmaTrack much lately and wanted to check in. Is anything not working for you, or missing? Your feedback helps us improve — and we're happy to help.` }
  }
  if (trialEnding) {
    return { subject: `Your PharmaTrack trial for ${pharmacy}`, text: `${hi} Your trial for ${pharmacy} is ending soon. How has it been so far? I can help you pick a plan or answer any questions.` }
  }
  return { subject: `Checking in from PharmaTrack`, text: `${hi} Just checking in — how is PharmaTrack working for ${pharmacy}? Anything we can do better?` }
}

const addDays = (n: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi" }).format(new Date(Date.now() + n * 86_400_000))

export function FollowUpPanel({ orgId, contact, level, trialEnding }: {
  orgId: string
  contact: { pharmacy: string; name: string | null; email: string | null; phone: string | null }
  level: HealthLevel
  trialEnding: boolean
}) {
  const qc = useQueryClient()
  const confirm = useConfirm()
  const [kind, setKind] = useState<Kind>("call")
  const [body, setBody] = useState("")
  const [followUp, setFollowUp] = useState<string>("")
  const [saving, setSaving] = useState(false)
  const { data, isLoading } = useQuery<{ notes: Note[] }>({
    queryKey: ["tenant-notes", orgId],
    queryFn: async () => {
      const res = await fetch(`/api/platform/tenants/${orgId}/notes`)
      if (!res.ok) throw new Error("Couldn't load notes")
      return res.json() as Promise<{ notes: Note[] }>
    },
  })

  const msg = message(level, contact.name ?? "", contact.pharmacy, trialEnding)
  let e164: string | null = null
  try {
    e164 = contact.phone ? normalizeKePhone(contact.phone) : null
  } catch {
    e164 = null
  }

  async function save() {
    if (!body.trim()) {
      toast.error("Write what was said or agreed first.")
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/platform/tenants/${orgId}/notes`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, body: body.trim(), follow_up_on: followUp || null }),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(json.error ?? "Couldn't save the note")
      setBody("")
      setFollowUp("")
      toast.success(followUp ? `Saved — follow up on ${shortDate(new Date(`${followUp}T12:00:00+03:00`).getTime())}` : "Saved to the contact log")
      await qc.invalidateQueries({ queryKey: ["tenant-notes", orgId] })
      await qc.invalidateQueries({ queryKey: ["platform-insights"] })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save the note")
    } finally {
      setSaving(false)
    }
  }

  async function remove(n: Note) {
    if (!(await confirm("This removes the note from the contact log.", { title: "Delete note?", confirmLabel: "Delete" }))) return
    const res = await fetch(`/api/platform/tenants/${orgId}/notes/${n.id}`, { method: "DELETE" })
    if (!res.ok) {
      toast.error("Couldn't delete the note")
      return
    }
    toast.success("Note deleted")
    await qc.invalidateQueries({ queryKey: ["tenant-notes", orgId] })
  }

  const contactBtn = "inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-[var(--pt-border)] text-sm font-medium hover:bg-[var(--pt-muted)] transition-colors"
  return (
    <Card title="Follow up">
      <div className="space-y-4">
        <div>
          <p className="text-sm font-semibold">{contact.name ?? "Owner"}</p>
          <p className="text-xs text-[var(--pt-text-secondary)]">{[contact.phone, contact.email].filter(Boolean).join(" · ") || "No contact details on file"}</p>
          <div className="flex flex-wrap gap-2 mt-2.5">
            {e164 && <a className={contactBtn} href={`tel:${e164}`} onClick={() => setKind("call")}><Phone size={14} /> Call</a>}
            {e164 && (
              <a className={contactBtn} target="_blank" rel="noreferrer" href={`https://wa.me/${e164.replace(/\D/g, "")}?text=${encodeURIComponent(msg.text)}`} onClick={() => setKind("whatsapp")}>
                <MessageCircle size={14} /> WhatsApp
              </a>
            )}
            {contact.email && (
              <a className={contactBtn} href={`mailto:${contact.email}?subject=${encodeURIComponent(msg.subject)}&body=${encodeURIComponent(msg.text)}`} onClick={() => setKind("email")}>
                <Mail size={14} /> Email
              </a>
            )}
          </div>
          <p className="text-[11px] text-[var(--pt-text-tertiary)] mt-2">WhatsApp and email open with a message written for this pharmacy&apos;s situation — edit it before sending.</p>
        </div>

        <div className="border-t border-[var(--pt-border)] pt-4 space-y-2.5">
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Type of contact">
            {KINDS.map(({ k, label, icon: Icon }) => (
              <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}
                className={`inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-xs font-medium border transition-colors ${kind === k ? "bg-[var(--pt-green-50)] border-[var(--pt-green)] text-[var(--pt-green-600)]" : "border-[var(--pt-border)] text-[var(--pt-text-secondary)] hover:bg-[var(--pt-muted)]"}`}>
                <Icon size={12} /> {label}
              </button>
            ))}
          </div>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={2000}
            placeholder="What was said or agreed — e.g. “Stock delivery delayed, will start selling Monday”"
            className="w-full rounded-lg border border-[var(--pt-border)] bg-[var(--pt-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pt-green)]" />
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-[var(--pt-text-secondary)] mr-1 inline-flex items-center gap-1"><CalendarClock size={13} /> Follow up</span>
            {[["", "No"], [addDays(3), "In 3 days"], [addDays(7), "Next week"], [addDays(14), "In 2 weeks"]].map(([v, l]) => (
              <button key={l} type="button" onClick={() => setFollowUp(v!)}
                className={`h-7 px-2.5 rounded-full text-xs border transition-colors ${followUp === v ? "bg-[var(--pt-green-50)] border-[var(--pt-green)] text-[var(--pt-green-600)] font-medium" : "border-[var(--pt-border)] text-[var(--pt-text-secondary)] hover:bg-[var(--pt-muted)]"}`}>{l}</button>
            ))}
            <input type="date" value={followUp} onChange={(e) => setFollowUp(e.target.value)} aria-label="Follow-up date"
              className="h-7 rounded-full border border-[var(--pt-border)] px-2 text-xs bg-[var(--pt-surface)]" />
          </div>
          <div className="flex justify-end">
            <Button onClick={() => void save()} disabled={saving} className="h-9 bg-[var(--pt-green)] hover:bg-[var(--pt-green-600)] text-white">
              {saving ? <Loader2 size={15} className="animate-spin" /> : "Save to log"}
            </Button>
          </div>
        </div>

        <div className="border-t border-[var(--pt-border)] pt-3">
          <p className="text-xs font-semibold text-[var(--pt-text-secondary)] mb-2">Contact log</p>
          {isLoading ? <Loader2 size={15} className="animate-spin text-[var(--pt-text-tertiary)]" /> : (data?.notes.length ?? 0) === 0 ? (
            <p className="text-sm text-[var(--pt-text-tertiary)]">No contact yet.</p>
          ) : (
            <ul className="space-y-3">
              {data!.notes.map((n) => {
                const Icon = KIND_ICON[n.kind] ?? StickyNote
                const due = n.follow_up_on && n.follow_up_on <= addDays(0)
                return (
                  <li key={n.id} className="flex gap-2.5 group">
                    <span className="w-7 h-7 rounded-full bg-[var(--pt-muted-strong)] text-[var(--pt-text-secondary)] flex items-center justify-center shrink-0"><Icon size={13} /></span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm whitespace-pre-wrap break-words">{n.body}</p>
                      <p className="text-[11px] text-[var(--pt-text-tertiary)] mt-0.5">
                        {n.author ?? n.author_email ?? "Operator"} · {ago(new Date(n.created_at).getTime())}
                        {n.follow_up_on && (
                          <span className={`ml-1.5 font-semibold ${due ? "text-[var(--pt-red)]" : "text-[var(--pt-text-secondary)]"}`}>
                            · follow up {shortDate(new Date(`${n.follow_up_on}T12:00:00+03:00`).getTime())}{due ? " (due)" : ""}
                          </span>
                        )}
                      </p>
                    </div>
                    <button onClick={() => void remove(n)} aria-label="Delete note" className="opacity-0 group-hover:opacity-100 focus:opacity-100 w-7 h-7 rounded-md flex items-center justify-center text-[var(--pt-text-tertiary)] hover:text-[var(--pt-red)] hover:bg-[var(--pt-muted)]">
                      <Trash2 size={13} />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </Card>
  )
}
