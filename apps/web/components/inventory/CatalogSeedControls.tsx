"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Sparkles, Loader2, Trash2, Rocket, Plus } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { QuickStartDialog } from "./QuickStartDialog"
import { CatalogReviewDialog } from "./CatalogReviewDialog"

interface SeedStatus { catalogTotal: number; seeded: number }

/**
 * Quick Start entry: load the Kenyan retail catalogue by department (products are
 * created active & priced), then tune price + opening stock in the review grid.
 * Owner/manager only (the API enforces this too).
 */
export function CatalogSeedControls({ canManage, branchId }: { canManage: boolean; branchId: string | null }) {
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [wizard, setWizard] = useState(false)
  const [review, setReview] = useState(false)

  const { data } = useQuery<SeedStatus>({
    queryKey: ["catalog-seed-status"],
    queryFn: async () => {
      const res = await fetch("/api/catalog/seed")
      if (!res.ok) throw new Error("Failed")
      return res.json() as Promise<SeedStatus>
    },
    enabled: canManage,
    staleTime: 30_000,
  })

  if (!canManage || !data) return null
  const hasSeeded = data.seeded > 0

  async function unseed() {
    setBusy(true)
    try {
      const res = await fetch("/api/catalog/seed", { method: "DELETE" })
      const json = (await res.json()) as { removed?: number; kept?: number; error?: string }
      if (!res.ok) throw new Error(json.error ?? "Failed")
      toast.success(`Removed ${json.removed ?? 0} products${json.kept ? ` · kept ${json.kept} in use` : ""}`)
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["catalog-seed-status"] }),
        qc.invalidateQueries({ queryKey: ["inventory"] }),
      ])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error")
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-[var(--pt-green-100)] bg-[var(--pt-green-50)] px-4 py-3 mb-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <Sparkles size={18} className="text-[var(--pt-green-600)] shrink-0" />
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-[var(--pt-green-700)]">Quick Start catalogue</p>
            <p className="text-[12px] text-[var(--pt-text-secondary)]">
              {hasSeeded
                ? `${data.seeded} of ${data.catalogTotal} products loaded — set prices & opening stock to sell`
                : `Load common products by department in seconds — active & priced, ready to tune`}
            </p>
          </div>
        </div>
        <div className="flex items-center flex-wrap gap-2 shrink-0">
          {hasSeeded && (
            <Button variant="outline" onClick={unseed} disabled={busy} className="gap-1.5 h-9" title="Remove untouched seeded products">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            </Button>
          )}
          {hasSeeded && (
            <Button variant="outline" onClick={() => setReview(true)} className="gap-1.5 h-9">
              <Rocket size={14} /> Price &amp; stock
            </Button>
          )}
          <Button onClick={() => setWizard(true)} className="gap-1.5 h-9 bg-[var(--pt-green)] hover:bg-[var(--pt-green-600)] text-white">
            {hasSeeded ? <><Plus size={14} /> Add more</> : <><Sparkles size={14} /> Quick Start</>}
          </Button>
        </div>
      </div>

      <QuickStartDialog
        open={wizard}
        onClose={() => setWizard(false)}
        onSeeded={() => { setWizard(false); setReview(true) }}
      />
      <CatalogReviewDialog open={review} onClose={() => setReview(false)} branchId={branchId} />
    </>
  )
}
