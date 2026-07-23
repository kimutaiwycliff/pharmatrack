"use client"

import { useState, useMemo } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Check, Loader2, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog"

interface Department { category: string; total: number; seeded: number }
interface SeedStatus { departments: Department[]; catalogTotal: number; seeded: number }

export function QuickStartDialog({
  open, onClose, onSeeded,
}: { open: boolean; onClose: () => void; onSeeded: () => void }) {
  const qc = useQueryClient()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  const { data, isLoading } = useQuery<SeedStatus>({
    queryKey: ["catalog-seed-status"],
    queryFn: async () => {
      const res = await fetch("/api/catalog/seed")
      if (!res.ok) throw new Error("Failed")
      return res.json() as Promise<SeedStatus>
    },
    enabled: open,
  })

  // Default selection: every department with anything left to seed.
  const departments = data?.departments ?? []
  const remaining = useMemo(
    () => departments.filter((d) => d.seeded < d.total).map((d) => d.category),
    [departments],
  )
  const effectiveSelected = selected.size > 0 ? selected : new Set(remaining)

  function toggle(cat: string) {
    setSelected((prev) => {
      const next = new Set(prev.size > 0 ? prev : remaining)
      next.has(cat) ? next.delete(cat) : next.add(cat)
      return next
    })
  }
  function selectAll() { setSelected(new Set(departments.map((d) => d.category))) }
  function clearAll() { setSelected(new Set([""])) } // sentinel: explicitly empty

  const chosen = [...effectiveSelected].filter(Boolean)
  const toSeedCount = departments
    .filter((d) => chosen.includes(d.category))
    .reduce((n, d) => n + (d.total - d.seeded), 0)

  async function seed() {
    if (chosen.length === 0) { toast.error("Pick at least one department"); return }
    setBusy(true)
    try {
      const res = await fetch("/api/catalog/seed", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ categories: chosen }),
      })
      const json = (await res.json()) as { seeded?: number; updated?: number; error?: string }
      if (!res.ok) throw new Error(json.error ?? "Failed")
      const added = (json.seeded ?? 0) + (json.updated ?? 0)
      toast.success(added ? `${added} products ready — set prices & stock next` : "Already loaded")
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["catalog-seed-status"] }),
        qc.invalidateQueries({ queryKey: ["inventory"] }),
        qc.invalidateQueries({ queryKey: ["catalog-review"] }),
      ])
      onSeeded()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles size={18} className="text-[var(--pt-green-600)]" /> Quick Start — load your catalogue
          </DialogTitle>
          <DialogDescription>
            Pick the departments you stock. Products are created <strong>active &amp; priced</strong> with
            reference prices — you adjust price and add opening stock in the next step.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-[var(--pt-text-secondary)]">{departments.length} departments</span>
          <div className="flex gap-3">
            <button onClick={selectAll} className="font-semibold text-[var(--pt-green-600)] hover:underline">Select all</button>
            <button onClick={clearAll} className="font-semibold text-[var(--pt-text-secondary)] hover:underline">Clear</button>
          </div>
        </div>

        <div className="max-h-[46vh] overflow-y-auto -mx-1 px-1 space-y-1.5">
          {isLoading && <div className="py-8 text-center text-sm text-[var(--pt-text-secondary)]"><Loader2 className="animate-spin inline" size={16} /> Loading…</div>}
          {departments.map((d) => {
            const on = chosen.includes(d.category)
            const left = d.total - d.seeded
            return (
              <button
                key={d.category}
                onClick={() => toggle(d.category)}
                className={`w-full flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                  on ? "border-[var(--pt-green)] bg-[var(--pt-green-50)]" : "border-[var(--pt-border)] hover:bg-[var(--pt-muted)]"
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border ${on ? "bg-[var(--pt-green)] border-[var(--pt-green)]" : "border-[var(--pt-border)]"}`}>
                    {on && <Check size={12} className="text-white" />}
                  </span>
                  <span className="text-sm font-medium truncate">{d.category}</span>
                </div>
                <span className="text-xs text-[var(--pt-text-secondary)] shrink-0 tabular-nums">
                  {d.seeded > 0 ? `${d.seeded}/${d.total} · ${left} new` : `${d.total} items`}
                </span>
              </button>
            )
          })}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={seed} disabled={busy || toSeedCount === 0}
            className="gap-1.5 bg-[var(--pt-green)] hover:bg-[var(--pt-green-600)] text-white">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {toSeedCount > 0 ? `Load ${toSeedCount} products` : "Nothing new to load"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
