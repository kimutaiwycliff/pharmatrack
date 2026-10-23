"use client"

import { useState } from "react"
import { Download, FileSpreadsheet, Info, Loader2, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { useSessionStore } from "@/lib/store/sessionStore"
import {
  EXPORT_HEADERS, EXPORT_WIDTHS, exportFileName, toExportRows, type ExportCell, type ExportProduct,
} from "@/lib/inventory/exportRows"

// Products → Export to Excel. The file uses the import template's columns, so
// it can be edited and imported back — or filled in as a count sheet for a
// new branch. Stock (one row per batch, at one branch) is for the owner only.

interface Props {
  onClose: () => void
  /** The Products list's current filters, offered as "only what's shown". */
  filter: { q: string; categoryId: string; label: string | null }
  /** Branch the stock option starts on (the active one). */
  branchId: string | null
}

const HEADER_STYLE = { fontWeight: "bold", textColor: "#FFFFFF", backgroundColor: "#0F766E", wrap: true, alignVertical: "center" } as const
const nairobiDate = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi" }).format(new Date())

export function ExportProductsDialog({ onClose, filter, branchId }: Props) {
  const isOwner = useSessionStore((s) => s.profile?.role === "owner")
  const branches = useSessionStore((s) => s.branches)
  const filtered = !!(filter.q.trim().length >= 2 || filter.categoryId)
  const [scope, setScope] = useState<"all" | "shown">(filtered ? "shown" : "all")
  const [withStock, setWithStock] = useState(false)
  const [stockBranch, setStockBranch] = useState(branchId ?? branches[0]?.id ?? "")
  const [busy, setBusy] = useState(false)

  async function download() {
    setBusy(true)
    try {
      const params = new URLSearchParams()
      if (scope === "shown") {
        if (filter.q.trim().length >= 2) params.set("q", filter.q.trim())
        if (filter.categoryId) params.set("category_id", filter.categoryId)
      }
      if (withStock && stockBranch) params.set("stock_branch_id", stockBranch)
      const res = await fetch(`/api/products/export?${params}`)
      const json = (await res.json()) as { org: string; branch: string | null; with_cost: boolean; products: ExportProduct[]; error?: string }
      if (!res.ok) throw new Error(json.error ?? "Couldn't export")
      if (json.products.length === 0) { toast.info("No active products match — nothing to export"); return }

      const { default: writeXlsxFile } = await import("write-excel-file/browser")
      const date = nairobiDate()
      const header = EXPORT_HEADERS.map((h) => ({ value: h, ...HEADER_STYLE }))
      const body = toExportRows(json.products, { withStock: !!json.branch }).map((r) => r.map((v: ExportCell) => (v == null ? null : { value: v })))
      const about = [
        `${json.org} — exported ${date}${json.branch ? `, with stock at ${json.branch}` : ""}`,
        "",
        `${json.products.length} active product${json.products.length === 1 ? "" : "s"}${scope === "shown" && filtered ? ` (filtered: ${filter.label})` : ""}.`,
        json.with_cost ? "Cost prices are per PACK; selling prices per UNIT; stock in UNITS — the same columns as the import template." : "Cost prices are left blank (your account can't see costs).",
        "",
        "To set up a new branch: fill in Qty in stock, Batch number and Expiry date for that branch,",
        "switch to the branch in PharmaTrack, then Products → Import from Excel. Existing products are recognised",
        "and their stock is received at that branch — nothing is duplicated.",
      ].map((t, i) => [{ value: t, ...(i === 0 ? { fontWeight: "bold" as const } : {}) }])
      await writeXlsxFile([
        { sheet: "Products", data: [header, ...body], columns: EXPORT_WIDTHS.map((width) => ({ width })), stickyRowsCount: 1 },
        { sheet: "About this export", data: about, columns: [{ width: 110 }] },
      ]).toFile(exportFileName(json.org, json.branch ? "stock" : "products", date, json.branch))
      toast.success(`Exported ${json.products.length} product${json.products.length === 1 ? "" : "s"}`)
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't export")
    } finally {
      setBusy(false)
    }
  }

  const radio = "mt-0.5 accent-[var(--pt-green)]"
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="export-title">
      <div className="bg-[var(--pt-surface)] rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileSpreadsheet size={18} className="text-[var(--pt-green-600)]" />
            <h2 id="export-title" className="text-lg font-bold">Export products to Excel</h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--pt-muted-strong)] text-[var(--pt-text-secondary)]">
            <X size={16} />
          </button>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold uppercase tracking-wide text-[var(--pt-text-secondary)] mb-1">Which products</legend>
          <label className="flex items-start gap-2 cursor-pointer text-sm">
            <input type="radio" className={radio} checked={scope === "all"} onChange={() => setScope("all")} />
            <span>All active products</span>
          </label>
          <label className={`flex items-start gap-2 text-sm ${filtered ? "cursor-pointer" : "opacity-50"}`}>
            <input type="radio" className={radio} checked={scope === "shown"} disabled={!filtered} onChange={() => setScope("shown")} />
            <span>
              Only what&apos;s shown
              <span className="block text-xs text-[var(--pt-text-tertiary)]">{filtered ? filter.label : "Search or pick a category on the Products page first"}</span>
            </span>
          </label>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold uppercase tracking-wide text-[var(--pt-text-secondary)] mb-1">Stock</legend>
          <label className="flex items-start gap-2 cursor-pointer text-sm">
            <input type="radio" className={radio} checked={!withStock} onChange={() => setWithStock(false)} />
            <span>
              Products only
              <span className="block text-xs text-[var(--pt-text-tertiary)]">Stock columns left blank — use it as a count sheet for a new branch.</span>
            </span>
          </label>
          {isOwner ? (
            <label className="flex items-start gap-2 cursor-pointer text-sm">
              <input type="radio" className={radio} checked={withStock} onChange={() => setWithStock(true)} />
              <span className="flex-1">
                With stock at a branch
                <span className="block text-xs text-[var(--pt-text-tertiary)]">One row per batch: quantity, batch number and expiry.</span>
                {withStock && (
                  <select
                    value={stockBranch}
                    onChange={(e) => setStockBranch(e.target.value)}
                    aria-label="Branch"
                    className="mt-2 h-9 w-full rounded-lg border border-[var(--pt-border)] px-2 text-sm bg-[var(--pt-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--pt-green)]"
                  >
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                )}
              </span>
            </label>
          ) : (
            <p className="text-xs text-[var(--pt-text-tertiary)] pl-6">Stock exports are for the pharmacy owner.</p>
          )}
        </fieldset>

        <p className="flex items-start gap-2 text-xs text-[var(--pt-text-secondary)] bg-[var(--pt-muted)] rounded-lg px-3 py-2">
          <Info size={14} className="shrink-0 mt-0.5" />
          Same columns as the import template, so you can edit the file and import it back. Exports are recorded in the activity log.
        </p>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void download()} disabled={busy || (withStock && !stockBranch)} className="bg-[var(--pt-green)] hover:bg-[var(--pt-green-600)] text-white">
            {busy ? <Loader2 size={15} className="animate-spin mr-1.5" /> : <Download size={15} className="mr-1.5" />}
            Download .xlsx
          </Button>
        </div>
      </div>
    </div>
  )
}
