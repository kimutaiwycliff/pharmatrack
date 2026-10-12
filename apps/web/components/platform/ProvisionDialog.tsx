"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { useQueryClient } from "@tanstack/react-query"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { STANDARD_TRIAL_DAYS } from "@/lib/launch-offer"

interface PriorMatch { id: string; org_name: string | null; created_at: string; source: string; matched_on: string[] }

const MATCH_LABEL: Record<string, string> = { email: "email", google: "Google account", registration_number: "PPB reg. no.", ip: "network" }
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-KE", { timeZone: "Africa/Nairobi", day: "numeric", month: "short", year: "numeric" })

export function ProvisionDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient()
  const [pharmacy, setPharmacy] = useState("")
  const [ownerName, setOwnerName] = useState("")
  const [ownerEmail, setOwnerEmail] = useState("")
  const [branch, setBranch] = useState("")
  const [regNo, setRegNo] = useState("")
  const [trialDays, setTrialDays] = useState(STANDARD_TRIAL_DAYS)
  // Set when the API reports a previous trial for this person.
  const [prior, setPrior] = useState<PriorMatch[] | null>(null)
  const [allowRepeat, setAllowRepeat] = useState(false)
  const [pending, start] = useTransition()

  function submit() {
    if (!pharmacy.trim() || !ownerName.trim() || !ownerEmail.trim()) {
      toast.error("Pharmacy, owner name and email are required"); return
    }
    start(async () => {
      try {
        const res = await fetch("/api/platform/tenants", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pharmacy_name: pharmacy,
            owner_name: ownerName,
            owner_email: ownerEmail,
            branch_name: branch || undefined,
            trial_days: trialDays,
            registration_number: regNo.trim() || undefined,
            allow_repeat_trial: allowRepeat,
          }),
        })
        const json = (await res.json().catch(() => ({}))) as { error?: string; code?: string; prior?: PriorMatch[] }
        if (res.status === 409 && json.code === "prior_trial") {
          setPrior(json.prior ?? [])
          toast.warning("This person has had a trial before — review below")
          return
        }
        if (!res.ok) throw new Error(json.error ?? "Failed")
        toast.success("Pharmacy created — owner invited by email")
        await qc.invalidateQueries({ queryKey: ["tenants"] })
        onOpenChange(false)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error")
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Add pharmacy</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-sm font-medium">Pharmacy name *</Label>
            <Input value={pharmacy} onChange={(e) => setPharmacy(e.target.value)} className="mt-1.5 h-10" autoFocus />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-sm font-medium">Owner name *</Label>
              <Input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} className="mt-1.5 h-10" />
            </div>
            <div>
              <Label className="text-sm font-medium">Owner email *</Label>
              <Input type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} className="mt-1.5 h-10" />
            </div>
            <div>
              <Label className="text-sm font-medium">First branch</Label>
              <Input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="Main Branch" className="mt-1.5 h-10" />
            </div>
            <div>
              <Label className="text-sm font-medium">Trial days</Label>
              <Input type="number" min={0} value={trialDays} onChange={(e) => setTrialDays(parseInt(e.target.value) || 0)} className="mt-1.5 h-10" />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-sm font-medium">PPB registration no. <span className="text-[var(--pt-text-tertiary)] font-normal">(optional)</span></Label>
              <Input value={regNo} onChange={(e) => setRegNo(e.target.value)} maxLength={60} placeholder="e.g. PPB/RET/1234/24" className="mt-1.5 h-10" />
            </div>
          </div>
          {prior && (
            <div className="rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-3 text-sm space-y-2">
              <p className="font-semibold text-amber-800 dark:text-amber-200">Previous trial{prior.length === 1 ? "" : "s"} found</p>
              <ul className="space-y-1 text-xs text-[var(--pt-text-secondary)]">
                {prior.slice(0, 5).map((p) => (
                  <li key={p.id}>
                    {p.org_name ?? "Deleted pharmacy"} · {fmtDate(p.created_at)} · {p.source} · matched on {p.matched_on.map((m) => MATCH_LABEL[m] ?? m).join(", ")}
                  </li>
                ))}
              </ul>
              <label className="flex items-center gap-2 text-xs font-medium">
                <input type="checkbox" checked={allowRepeat} onChange={(e) => setAllowRepeat(e.target.checked)} />
                Grant a trial anyway (recorded in the audit log)
              </label>
              <p className="text-xs text-[var(--pt-text-tertiary)]">Or set trial days to 0 to create the pharmacy without a trial.</p>
            </div>
          )}
          <p className="text-xs text-[var(--pt-text-tertiary)]">The owner gets an email invite to set their password. A default subscription, branch and appointment services are created.</p>
        </div>
        <div className="flex gap-2 pt-4 border-t border-[var(--pt-border)] mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">Cancel</Button>
          <Button onClick={submit} disabled={pending} className="flex-1">{pending ? "Creating…" : "Create pharmacy"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
