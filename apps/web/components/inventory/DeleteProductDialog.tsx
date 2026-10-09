"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { AlertTriangle, EyeOff, Loader2, Trash2, CheckCircle2 } from "lucide-react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useCan } from "@/lib/store/sessionStore"

interface Impact {
  batches: number
  unitsOnHand: number
  saleLines: number
  adjustments: number
  prescriptionLines: number
  clean: boolean
}

interface Props {
  product: { id: string; name: string; is_active: boolean | null } | null
  onClose: () => void
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-KE")} ${n === 1 ? one : many}`

/**
 * One place to retire a product. Shows what's attached to it, recommends
 * Deactivate (reversible, keeps history), and — for users with the
 * `products.delete_permanent` permission — offers a typed-confirmation
 * permanent delete. Unused products just get a simple delete.
 * Render with `key={product?.id}` so each product starts fresh.
 */
export function DeleteProductDialog({ product, onClose }: Props) {
  const qc = useQueryClient()
  const canEdit = useCan("products.edit")
  const [mode, setMode] = useState<"choose" | "permanent">("choose")
  const [typed, setTyped] = useState("")
  const [busy, setBusy] = useState<null | "deactivate" | "delete">(null)

  const { data, isLoading } = useQuery<{ impact: Impact; canDeletePermanently: boolean }>({
    queryKey: ["product-delete-impact", product?.id],
    enabled: !!product,
    staleTime: 0,
    queryFn: async () => {
      const res = await fetch(`/api/products/${product!.id}/delete-impact`)
      if (!res.ok) throw new Error("Failed to check product history")
      return res.json() as Promise<{ impact: Impact; canDeletePermanently: boolean }>
    },
  })

  async function done(message: string) {
    await qc.invalidateQueries({ queryKey: ["products"] })
    void qc.invalidateQueries({ queryKey: ["inventory"] })
    toast.success(message)
    onClose()
  }

  async function deactivate() {
    if (!product) return
    setBusy("deactivate")
    try {
      const res = await fetch(`/api/products/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: false }),
      })
      if (!res.ok) throw new Error("Failed to deactivate product")
      await done(`${product.name} deactivated — hidden from POS and inventory`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to deactivate")
    } finally {
      setBusy(null)
    }
  }

  async function remove(permanent: boolean) {
    if (!product) return
    setBusy("delete")
    try {
      const res = await fetch(`/api/products/${product.id}${permanent ? "?permanent=1" : ""}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: permanent ? JSON.stringify({ confirm_name: typed }) : undefined,
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(json.error ?? "Failed to delete product")
      await done(permanent ? `${product.name} permanently deleted` : `${product.name} deleted`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete product")
    } finally {
      setBusy(null)
    }
  }

  const impact = data?.impact
  const nameMatches = !!product && typed.trim().toLowerCase() === product.name.trim().toLowerCase()

  return (
    <Dialog open={!!product} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-md p-6">
        {product && (
          <>
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle size={17} className="text-[var(--pt-red)]" />
              <h2 className="text-lg font-bold">Remove “{product.name}”?</h2>
            </div>

            {isLoading || !impact ? (
              <div className="py-8 flex justify-center text-[var(--pt-text-tertiary)]">
                <Loader2 size={18} className="animate-spin" />
              </div>
            ) : impact.clean ? (
              <>
                <p className="text-sm text-[var(--pt-text-secondary)] mb-5">
                  This product has never been stocked or sold, so it can be deleted cleanly. This can&apos;t be undone.
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={onClose} disabled={!!busy}>Cancel</Button>
                  <Button className="flex-1 bg-[var(--pt-red)] hover:opacity-90 text-white" onClick={() => remove(false)} disabled={!!busy}>
                    {busy === "delete" ? <Loader2 size={15} className="animate-spin" /> : "Delete"}
                  </Button>
                </div>
              </>
            ) : mode === "choose" ? (
              <>
                <p className="text-sm text-[var(--pt-text-secondary)] mb-3">This product has history attached:</p>
                <ul className="text-sm rounded-xl bg-[var(--pt-muted)] px-4 py-3 mb-4 space-y-1">
                  {impact.batches > 0 && <li>{plural(impact.batches, "batch", "batches")} · {plural(impact.unitsOnHand, "unit")} on hand</li>}
                  {impact.saleLines > 0 && <li>{plural(impact.saleLines, "sales line")}</li>}
                  {impact.adjustments > 0 && <li>{plural(impact.adjustments, "stock adjustment")}</li>}
                  {impact.prescriptionLines > 0 && <li>{plural(impact.prescriptionLines, "prescription line")}</li>}
                </ul>

                <div className="space-y-2">
                  {canEdit && (
                    <button
                      onClick={deactivate}
                      disabled={!!busy || product.is_active === false}
                      className="w-full text-left rounded-xl border-2 border-[var(--pt-green)] bg-[var(--pt-green-50)] px-4 py-3 disabled:opacity-60 transition-colors"
                    >
                      <span className="flex items-center gap-2 text-sm font-bold text-[var(--pt-green-600)]">
                        {busy === "deactivate" ? <Loader2 size={15} className="animate-spin" /> : product.is_active === false ? <CheckCircle2 size={15} /> : <EyeOff size={15} />}
                        {product.is_active === false ? "Already deactivated" : "Deactivate (recommended)"}
                      </span>
                      <span className="block text-xs text-[var(--pt-text-secondary)] mt-0.5">
                        Hidden from POS and inventory. All history is kept and you can reactivate it any time.
                      </span>
                    </button>
                  )}

                  {data.canDeletePermanently && (
                    <button
                      onClick={() => setMode("permanent")}
                      disabled={!!busy}
                      className="w-full text-left rounded-xl border border-[var(--pt-border)] hover:border-red-300 dark:hover:border-red-500/40 px-4 py-3 transition-colors"
                    >
                      <span className="flex items-center gap-2 text-sm font-bold text-[var(--pt-red)]">
                        <Trash2 size={15} /> Delete permanently…
                      </span>
                      <span className="block text-xs text-[var(--pt-text-secondary)] mt-0.5">
                        Erases the product, its batches and stock adjustments. Can&apos;t be undone.
                      </span>
                    </button>
                  )}
                </div>

                <Button variant="outline" className="w-full mt-3" onClick={onClose} disabled={!!busy}>Cancel</Button>
              </>
            ) : (
              <>
                <div className="rounded-xl bg-red-50 dark:bg-red-500/10 text-red-800 dark:text-red-200 px-4 py-3 mb-4 text-sm space-y-1.5">
                  <p className="font-semibold">This permanently erases:</p>
                  <ul className="list-disc pl-5 text-xs space-y-0.5">
                    <li>The product, its pack sizes and barcode</li>
                    {impact.batches > 0 && <li>{plural(impact.batches, "batch", "batches")}{impact.unitsOnHand > 0 ? ` — including ${plural(impact.unitsOnHand, "unit")} still on hand` : ""}</li>}
                    {impact.adjustments > 0 && <li>{plural(impact.adjustments, "stock adjustment")}</li>}
                  </ul>
                  <p className="font-semibold pt-1">Kept:</p>
                  <ul className="list-disc pl-5 text-xs space-y-0.5">
                    {impact.saleLines > 0 && <li>{plural(impact.saleLines, "past sales line")} — receipts, revenue and profit stay correct</li>}
                    <li>Controlled-substance register entries</li>
                    <li>A full record of the product in the audit log</li>
                  </ul>
                </div>
                <label className="block text-xs font-semibold text-[var(--pt-text-secondary)] mb-1.5">
                  Type <span className="font-bold text-[var(--pt-text)]">{product.name}</span> to confirm
                </label>
                <Input value={typed} onChange={(e) => setTyped(e.target.value)} className="h-10 mb-4" autoFocus />
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setMode("choose")} disabled={!!busy}>Back</Button>
                  <Button
                    className="flex-1 bg-[var(--pt-red)] hover:opacity-90 text-white"
                    onClick={() => remove(true)}
                    disabled={!!busy || !nameMatches}
                  >
                    {busy === "delete" ? <Loader2 size={15} className="animate-spin" /> : "Delete permanently"}
                  </Button>
                </div>
              </>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
