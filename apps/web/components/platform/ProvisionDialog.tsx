"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { useQueryClient } from "@tanstack/react-query"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function ProvisionDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient()
  const [pharmacy, setPharmacy] = useState("")
  const [ownerName, setOwnerName] = useState("")
  const [ownerEmail, setOwnerEmail] = useState("")
  const [branch, setBranch] = useState("")
  const [trialDays, setTrialDays] = useState(14)
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
          }),
        })
        const json = (await res.json()) as { error?: string }
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
          </div>
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
