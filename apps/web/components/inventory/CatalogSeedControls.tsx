"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Sparkles, Loader2, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"

interface SeedStatus { catalogTotal: number; seeded: number }

/**
 * One-click "seed my pharmacy from the Kenyan drug catalog" + unseed. Seeded
 * products land inactive and unpriced so they can't be sold until reviewed.
 * Owner/manager only (the API enforces this too).
 */
export function CatalogSeedControls({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient()
  const [busy, setBusy] = useState<null | "seed" | "unseed">(null)

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

  async function run(method: "POST" | "DELETE") {
    setBusy(method === "POST" ? "seed" : "unseed")
    try {
      const res = await fetch("/api/catalog/seed", { method })
      const json = (await res.json()) as { seeded?: number; removed?: number; kept?: number; error?: string }
      if (!res.ok) throw new Error(json.error ?? "Failed")
      if (method === "POST") {
        toast.success(json.seeded ? `Added ${json.seeded} catalog products (inactive — set prices to sell)` : "Catalog already loaded")
      } else {
        toast.success(`Removed ${json.removed ?? 0} seeded products${json.kept ? ` · kept ${json.kept} in use` : ""}`)
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["catalog-seed-status"] }),
        qc.invalidateQueries({ queryKey: ["inventory"] }),
      ])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error")
    } finally {
      setBusy(null)
    }
  }

  const allSeeded = data.seeded >= data.catalogTotal && data.catalogTotal > 0

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--pt-green-100)] bg-[var(--pt-green-50)] px-4 py-3 mb-4">
      <div className="flex items-center gap-2.5 min-w-0">
        <Sparkles size={18} className="text-[var(--pt-green-600)] shrink-0" />
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-[var(--pt-green-700)]">Kenyan drug catalog</p>
          <p className="text-[12px] text-[var(--pt-text-secondary)]">
            {data.seeded > 0
              ? `${data.seeded} of ${data.catalogTotal} catalog products loaded into your branch`
              : `Load ${data.catalogTotal} common products to start — they come in inactive & unpriced`}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {data.seeded > 0 && (
          <Button
            variant="outline"
            onClick={() => run("DELETE")}
            disabled={busy !== null}
            className="gap-1.5 h-9"
          >
            {busy === "unseed" ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            Unseed
          </Button>
        )}
        {!allSeeded && (
          <Button
            onClick={() => run("POST")}
            disabled={busy !== null}
            className="gap-1.5 h-9 bg-[var(--pt-green)] hover:bg-[var(--pt-green-600)] text-white"
          >
            {busy === "seed" ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {data.seeded > 0 ? "Load remaining" : "Load catalog"}
          </Button>
        )}
      </div>
    </div>
  )
}
