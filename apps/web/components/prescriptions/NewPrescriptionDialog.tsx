"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Plus, Trash2, AlertTriangle, Loader2 } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useDebounce } from "@/lib/hooks/useDebounce"
import type { DurWarning } from "@pharmatrack/types"

interface CustomerHit { id: string; full_name: string; phone: string | null; allergies?: string | null }
interface DrugLine { drug_name: string; dose: string; frequency: string; duration: string; quantity: string; instructions: string }

const emptyLine: DrugLine = { drug_name: "", dose: "", frequency: "", duration: "", quantity: "", instructions: "" }

const SEV_STYLES: Record<string, string> = {
  severe: "border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300",
  moderate: "border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300",
  minor: "border-[var(--pt-border)] bg-[var(--pt-muted)] text-[var(--pt-text-secondary)]",
}

export function NewPrescriptionDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient()
  const [customerId, setCustomerId] = useState<string | undefined>(undefined)
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [prescriber, setPrescriber] = useState("")
  const [regNo, setRegNo] = useState("")
  const [diagnosis, setDiagnosis] = useState("")
  const [lines, setLines] = useState<DrugLine[]>([{ ...emptyLine }])
  const [warnings, setWarnings] = useState<DurWarning[]>([])
  const [needsConfirm, setNeedsConfirm] = useState(false)
  const [pending, start] = useTransition()

  const search = useDebounce(name || phone, 250)
  const { data: hits = [] } = useQuery<CustomerHit[]>({
    queryKey: ["customer-search", search],
    queryFn: async () => {
      const res = await fetch(`/api/customers?q=${encodeURIComponent(search)}`)
      if (!res.ok) return []
      return (await res.json() as { customers: CustomerHit[] }).customers
    },
    enabled: open && !customerId && search.length >= 2,
    staleTime: 30_000,
  })

  function setLine(i: number, patch: Partial<DrugLine>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
    setNeedsConfirm(false)
    setWarnings([])
  }

  function submit(confirm: boolean) {
    if (!name.trim()) { toast.error("Patient name is required"); return }
    const items = lines
      .filter((l) => l.drug_name.trim())
      .map((l) => ({
        drug_name: l.drug_name.trim(),
        dose: l.dose || undefined,
        frequency: l.frequency || undefined,
        duration: l.duration || undefined,
        quantity: l.quantity ? parseInt(l.quantity) : null,
        instructions: l.instructions || undefined,
      }))
    if (items.length === 0) { toast.error("Add at least one drug"); return }

    start(async () => {
      try {
        const res = await fetch("/api/prescriptions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customer_id: customerId,
            customer_name: name,
            customer_phone: phone || undefined,
            prescriber_name: prescriber || undefined,
            prescriber_reg_no: regNo || undefined,
            diagnosis: diagnosis || undefined,
            items,
            confirm,
          }),
        })
        const json = (await res.json()) as { error?: string; warnings?: DurWarning[]; requiresConfirmation?: boolean }
        if (res.status === 409 && json.requiresConfirmation) {
          setWarnings(json.warnings ?? [])
          setNeedsConfirm(true)
          return
        }
        if (!res.ok) throw new Error(json.error ?? "Failed")
        if (json.warnings && json.warnings.length > 0) {
          toast.warning(`Prescribed with ${json.warnings.length} advisory warning(s)`)
        } else {
          toast.success("Prescription created")
        }
        await qc.invalidateQueries({ queryKey: ["prescriptions"] })
        onOpenChange(false)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error")
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>New prescription</DialogTitle></DialogHeader>

        <div className="space-y-5">
          {/* Patient */}
          <div className="space-y-3">
            <p className="text-[11px] font-bold text-[var(--pt-text-secondary)] uppercase tracking-wider">Patient</p>
            <div className="relative">
              <Label className="text-sm font-medium">Full name *</Label>
              <Input value={name} onChange={(e) => { setName(e.target.value); setCustomerId(undefined) }} className="mt-1.5 h-10" autoFocus />
              {hits.length > 0 && !customerId && (
                <div className="absolute z-10 mt-1 w-full rounded-lg border border-[var(--pt-border)] bg-[var(--pt-surface)] shadow-lg max-h-40 overflow-y-auto">
                  {hits.map((c) => (
                    <button key={c.id} type="button" onClick={() => { setCustomerId(c.id); setName(c.full_name); setPhone(c.phone ?? "") }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--pt-muted)] flex justify-between gap-2">
                      <span className="font-medium">{c.full_name}</span>
                      <span className="text-[var(--pt-text-tertiary)]">{c.phone}{c.allergies ? " · ⚠ allergies" : ""}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label className="text-sm font-medium">Phone</Label><Input value={phone} onChange={(e) => { setPhone(e.target.value); setCustomerId(undefined) }} className="mt-1.5 h-10" /></div>
              <div><Label className="text-sm font-medium">Diagnosis</Label><Input value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} className="mt-1.5 h-10" /></div>
              <div><Label className="text-sm font-medium">Prescriber</Label><Input value={prescriber} onChange={(e) => setPrescriber(e.target.value)} placeholder="Dr. …" className="mt-1.5 h-10" /></div>
              <div><Label className="text-sm font-medium">Reg. no.</Label><Input value={regNo} onChange={(e) => setRegNo(e.target.value)} className="mt-1.5 h-10" /></div>
            </div>
          </div>

          {/* Drugs */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold text-[var(--pt-text-secondary)] uppercase tracking-wider">Medications</p>
              <button type="button" onClick={() => setLines((ls) => [...ls, { ...emptyLine }])} className="text-xs font-semibold text-[var(--pt-green-600)] inline-flex items-center gap-1 hover:underline"><Plus size={12} /> Add drug</button>
            </div>
            {lines.map((l, i) => (
              <div key={i} className="rounded-lg border border-[var(--pt-border)] p-3 space-y-2 bg-[var(--pt-muted)]">
                <div className="flex gap-2">
                  <Input value={l.drug_name} onChange={(e) => setLine(i, { drug_name: e.target.value })} placeholder="Drug name * (e.g. Amoxicillin 500mg)" className="h-9 flex-1" />
                  {lines.length > 1 && <button type="button" onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))} className="text-[var(--pt-red)] px-2"><Trash2 size={15} /></button>}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <Input value={l.dose} onChange={(e) => setLine(i, { dose: e.target.value })} placeholder="Dose" className="h-9 text-sm" />
                  <Input value={l.frequency} onChange={(e) => setLine(i, { frequency: e.target.value })} placeholder="Frequency" className="h-9 text-sm" />
                  <Input value={l.duration} onChange={(e) => setLine(i, { duration: e.target.value })} placeholder="Duration" className="h-9 text-sm" />
                  <Input type="number" min={1} value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} placeholder="Qty" className="h-9 text-sm" />
                </div>
              </div>
            ))}
          </div>

          {/* DUR warnings */}
          {warnings.length > 0 && (
            <div className="space-y-2">
              {warnings.map((w, i) => (
                <div key={i} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${SEV_STYLES[w.severity]}`}>
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  <span><span className="font-semibold uppercase">{w.severity} {w.type}</span> — {w.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-4 border-t border-[var(--pt-border)] mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">Cancel</Button>
          {needsConfirm ? (
            <Button onClick={() => submit(true)} disabled={pending} className="flex-1 bg-[var(--pt-red)] hover:opacity-90 text-white font-semibold">
              {pending ? "Saving…" : "Prescribe anyway"}
            </Button>
          ) : (
            <Button onClick={() => submit(false)} disabled={pending} className="flex-1 bg-[var(--pt-green)] hover:bg-[var(--pt-green-600)] text-white font-semibold">
              {pending ? <Loader2 size={15} className="animate-spin" /> : "Create prescription"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
