"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Loader2, X, Upload, Download, FileSpreadsheet, AlertTriangle, CheckCircle2, Copy, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { useQueryClient } from "@tanstack/react-query"
import { parseCSV, INVENTORY_IMPORT_HEADERS, INVENTORY_IMPORT_EXAMPLE_ROW } from "@pharmatrack/core"
import { Button } from "@/components/ui/button"
import { IMPORT_FIELDS, autoMapping, toImportRows } from "@/lib/inventory/importRows"

interface Props {
  branchId: string | null
  branchName?: string
  onClose: () => void
}

type ImportResult = {
  created: number; stockBatches: number; stockAdded?: number; skipped?: number; failed: number; total: number
  errors: Array<{ row: number; name: string; error: string }>
}

type RowStatus = "new" | "duplicate" | "invalid"
type PreviewRow = { row: number; name: string; status: RowStatus; match?: string; filled?: string[]; error?: string }
type Preview = { total: number; new: number; duplicates: number; invalid: number; filled_from_catalog: number; rows: PreviewRow[] }

const MAX_ROWS = 2000

function downloadTemplate() {
  const csv = [INVENTORY_IMPORT_HEADERS.join(","), INVENTORY_IMPORT_EXAMPLE_ROW.join(",")].join("\n")
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url; a.download = "pharmatrack-inventory-template.csv"; a.click()
  URL.revokeObjectURL(url)
}

// Sheets often start with a title or blank rows: the header is the row (in the
// first 15) whose cells we recognise the most.
function findHeaderRow(rows: unknown[][]): number {
  let best = 0, bestScore = -1
  rows.slice(0, 15).forEach((r, i) => {
    const score = Object.keys(autoMapping(r.map((c) => String(c ?? "")))).length
    if (score > bestScore) { best = i; bestScore = score }
  })
  return best
}

async function readFile(file: File): Promise<unknown[][]> {
  if (/\.xlsx$/i.test(file.name)) {
    // Loaded only when someone imports a spreadsheet.
    const { readSheet } = await import("read-excel-file/universal")
    return (await readSheet(file)) as unknown[][]
  }
  if (/\.xls$/i.test(file.name)) throw new Error("Old .xls files aren't supported — in Excel use File → Save As → .xlsx or CSV")
  return parseCSV(await file.text())
}

const STATUS_STYLE: Record<RowStatus, string> = {
  new: "bg-[var(--pt-green-50)] text-[var(--pt-green-700)]",
  duplicate: "bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200",
  invalid: "bg-[var(--pt-red-50)] text-[var(--pt-red)]",
}
const STATUS_LABEL: Record<RowStatus, string> = { new: "New", duplicate: "Already yours", invalid: "Won't import" }

// Bulk import: Excel (.xlsx) or CSV → match columns (guessed, editable) →
// a server check of every row against your products and the drug catalogue →
// import. Re-importing a sheet never creates second copies: rows you already
// have are skipped, or their opening stock is added to the existing product.
export function BulkImportDialog({ branchId, branchName, onClose }: Props) {
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState("")
  const [reading, setReading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [headers, setHeaders] = useState<string[]>([])
  const [dataRows, setDataRows] = useState<unknown[][]>([])
  const [mapping, setMapping] = useState<Record<string, string>>({}) // fieldKey -> header
  const [onDuplicate, setOnDuplicate] = useState<"add_stock" | "skip">("add_stock")
  const [preview, setPreview] = useState<Preview | null>(null)
  const [checking, setChecking] = useState(false)
  const [filter, setFilter] = useState<RowStatus | "all">("all")
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

  async function handleFile(file: File) {
    setReading(true)
    try {
      const rows = await readFile(file)
      const h = findHeaderRow(rows)
      const hdr = (rows[h] ?? []).map((c) => String(c ?? "").trim())
      const body = rows.slice(h + 1)
      if (!hdr.some(Boolean) || body.length === 0) { toast.error("That file has no data rows"); return }
      if (body.length > MAX_ROWS) { toast.error(`That file has ${body.length} rows — import up to ${MAX_ROWS} at a time`); return }
      setFileName(file.name)
      setHeaders(hdr)
      setDataRows(body)
      setMapping(autoMapping(hdr))
      setResult(null)
      setPreview(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't read that file")
    } finally {
      setReading(false)
    }
  }

  const prepared = useMemo(
    () => (headers.length ? toImportRows(headers, dataRows, mapping, { hasBranch: !!branchId }) : []),
    [headers, dataRows, mapping, branchId],
  )
  const nameMapped = !!mapping["name"]
  const priceMapped = !!mapping["selling_price"] || !!mapping["pack_selling_price"]
  const ready = prepared.length > 0 && nameMapped && priceMapped

  // Ask the server how each row lands (new / already yours / invalid), again
  // whenever the column matching changes.
  useEffect(() => {
    if (!ready) return
    let active = true
    const t = setTimeout(async () => {
      setChecking(true)
      try {
        const res = await fetch("/api/inventory/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ branch_id: branchId ?? undefined, rows: prepared.map((p) => p.data), dry_run: true }),
        })
        const json = (await res.json()) as Preview & { error?: string }
        if (!res.ok) throw new Error(json.error ?? "Couldn't check the file")
        if (active) setPreview(json)
      } catch (err) {
        if (active) { setPreview(null); toast.error(err instanceof Error ? err.message : "Couldn't check the file") }
      } finally {
        if (active) setChecking(false)
      }
    }, 400)
    return () => { active = false; clearTimeout(t) }
  }, [prepared, ready, branchId])

  const shownPreview = ready ? preview : null
  const localProblems = prepared.filter((p) => p.problems.length > 0).length
  const willAddStock = shownPreview && onDuplicate === "add_stock"
    ? shownPreview.rows.filter((r) => r.status === "duplicate" && Number(prepared[r.row - 1]?.data.opening_qty) > 0).length
    : 0
  const canImport = !!shownPreview && (shownPreview.new > 0 || willAddStock > 0) && !submitting && !checking

  async function submit() {
    setSubmitting(true)
    try {
      const res = await fetch("/api/inventory/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch_id: branchId ?? undefined, rows: prepared.map((p) => p.data), on_duplicate: onDuplicate }),
      })
      const json = (await res.json()) as ImportResult & { error?: string }
      if (!res.ok) throw new Error(json.error ?? "Import failed")
      setResult(json)
      if (json.created > 0 || (json.stockAdded ?? 0) > 0) {
        toast.success(`Imported ${json.created} product${json.created === 1 ? "" : "s"}`)
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["inventory"] }),
          queryClient.invalidateQueries({ queryKey: ["products"] }),
        ])
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed")
    } finally {
      setSubmitting(false)
    }
  }

  function reset() {
    setResult(null); setHeaders([]); setDataRows([]); setMapping({}); setPreview(null); setFileName(""); setFilter("all")
  }

  const tableRows: Array<{ row: number; info: PreviewRow | null }> = shownPreview
    ? shownPreview.rows.filter((r) => filter === "all" || r.status === filter).slice(0, 200).map((r) => ({ row: r.row, info: r }))
    : prepared.slice(0, 50).map((_, i) => ({ row: i + 1, info: null }))

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false) }}
      onDrop={(e) => {
        e.preventDefault(); setDragging(false)
        const f = e.dataTransfer.files?.[0]
        if (f && !result) void handleFile(f)
      }}
    >
      <div className="bg-[var(--pt-surface)] rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <FileSpreadsheet size={18} className="text-[var(--pt-green-600)]" />
            <h2 className="text-lg font-bold">Bulk import inventory</h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--pt-muted-strong)] text-[var(--pt-text-secondary)]">
            <X size={16} />
          </button>
        </div>
        <p className="text-sm text-[var(--pt-text-secondary)] mb-5">
          Upload your stock sheet (Excel or CSV) to add many products at once.{" "}
          {branchId ? <>Opening stock will be received at <span className="font-semibold">{branchName ?? "the active branch"}</span>.</> : "Select a branch first to also load opening stock."}
        </p>

        {result ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Created", value: result.created, tone: "text-[var(--pt-green-600)]" },
                { label: "Stock added to existing", value: result.stockAdded ?? 0, tone: "" },
                { label: "Skipped (already yours)", value: result.skipped ?? 0, tone: "" },
                { label: "Failed", value: result.failed, tone: result.failed ? "text-[var(--pt-red)]" : "" },
              ].map((s) => (
                <div key={s.label} className="rounded-xl border border-[var(--pt-border)] p-4">
                  <p className="text-[11px] uppercase tracking-wide text-[var(--pt-text-secondary)] font-semibold">{s.label}</p>
                  <p className={`text-2xl font-bold tabular-nums ${s.tone}`}>{s.value}</p>
                </div>
              ))}
            </div>
            {result.errors.length > 0 && (
              <div className="rounded-lg border border-[var(--pt-border)] max-h-64 overflow-y-auto">
                {result.errors.map((e, i) => (
                  <div key={i} className="flex items-start gap-2 px-3 py-2 text-[13px] border-b border-[var(--pt-border)] last:border-b-0">
                    <AlertTriangle size={14} className="text-amber-500 mt-0.5 shrink-0" />
                    <span><span className="font-medium">Row {e.row}</span> ({e.name}): {e.error}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={reset}>Import another file</Button>
              <Button onClick={onClose} className="bg-[var(--pt-green)] hover:bg-[var(--pt-green-600)] text-white">Done</Button>
            </div>
          </div>
        ) : headers.length === 0 ? (
          <div className="space-y-4">
            <button
              onClick={() => fileRef.current?.click()}
              disabled={reading}
              className={`w-full rounded-xl border-2 border-dashed transition-colors py-10 flex flex-col items-center gap-2 ${dragging ? "border-[var(--pt-green)] bg-[var(--pt-green-50)]" : "border-[var(--pt-border-strong)] hover:border-[var(--pt-green)] hover:bg-[var(--pt-muted)]"}`}
            >
              {reading ? <Loader2 size={26} className="animate-spin text-[var(--pt-text-tertiary)]" /> : <Upload size={26} className="text-[var(--pt-text-tertiary)]" />}
              <span className="text-sm font-semibold">{reading ? "Reading…" : "Choose an Excel or CSV file"}</span>
              <span className="text-xs text-[var(--pt-text-tertiary)]">or drag it onto this window · .xlsx or .csv · up to {MAX_ROWS} rows</span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = "" }}
            />
            <button onClick={downloadTemplate} className="flex items-center gap-1.5 text-sm font-medium text-[var(--pt-green-600)] hover:underline">
              <Download size={14} /> Download a template
            </button>
            <ul className="text-xs text-[var(--pt-text-tertiary)] space-y-1 list-disc pl-4">
              <li>Use your own sheet — we match the columns for you (Item, Unit Price, Pack Price, Qty, Exp. Date…). Only a <span className="font-semibold">name</span> and a <span className="font-semibold">price</span> are required.</li>
              <li>Prices can be per unit or per pack; amounts like “KES 1,200” and expiries like “03/2027” or “Mar-27” are understood.</li>
              <li>Products you already have are never added twice. Blank form, unit and Rx details are filled from the drug catalogue.</li>
            </ul>
          </div>
        ) : (
          <div className="space-y-5">
            <div>
              <p className="text-sm font-semibold mb-1">Match your columns <span className="font-normal text-[var(--pt-text-tertiary)]">— {fileName}</span></p>
              <p className="text-xs text-[var(--pt-text-tertiary)] mb-2">We guessed these from your headings; change any that are wrong.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
                {IMPORT_FIELDS.map((f) => (
                  <div key={f.key} className="flex items-center gap-2">
                    <label htmlFor={`map-${f.key}`} className="text-[13px] w-40 shrink-0">
                      {f.label}{f.required && <span className="text-[var(--pt-red)]">*</span>}
                      {f.hint && <span className="block text-[10px] text-[var(--pt-text-tertiary)]">{f.hint}</span>}
                    </label>
                    <select
                      id={`map-${f.key}`}
                      value={mapping[f.key] ?? ""}
                      onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value }))}
                      className={`flex-1 min-w-0 h-9 rounded-lg border px-2 text-[13px] bg-[var(--pt-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--pt-green)] ${mapping[f.key] ? "border-[var(--pt-green-100)]" : "border-[var(--pt-border)]"}`}
                    >
                      <option value="">— skip —</option>
                      {headers.map((h, i) => (h ? <option key={`${h}-${i}`} value={h}>{h}</option> : null))}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {(!nameMapped || !priceMapped) && (
              <p className="text-[13px] text-[var(--pt-red)] bg-[var(--pt-red-50)] px-3 py-2 rounded-lg">
                Choose the <span className="font-semibold">Name</span> column and a price column (<span className="font-semibold">Selling price</span> or <span className="font-semibold">Pack selling price</span>) to continue.
              </p>
            )}

            {ready && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  {checking || !shownPreview ? (
                    <span className="text-[12px] text-[var(--pt-text-secondary)] inline-flex items-center gap-1.5"><Loader2 size={13} className="animate-spin" /> Checking {prepared.length} rows against your products…</span>
                  ) : (
                    <>
                      {([
                        ["all", `All ${shownPreview.total}`],
                        ["new", `${shownPreview.new} new`],
                        ["duplicate", `${shownPreview.duplicates} already yours`],
                        ["invalid", `${shownPreview.invalid} won't import`],
                      ] as const).map(([k, label]) => (
                        <button key={k} onClick={() => setFilter(k)}
                          className={`h-7 px-2.5 rounded-full text-xs font-semibold border ${filter === k ? "border-[var(--pt-green)] bg-[var(--pt-green-50)] text-[var(--pt-green-700)]" : "border-[var(--pt-border)] text-[var(--pt-text-secondary)] hover:bg-[var(--pt-muted)]"}`}>
                          {label}
                        </button>
                      ))}
                      {shownPreview.filled_from_catalog > 0 && (
                        <span className="text-[12px] text-[var(--pt-text-secondary)] inline-flex items-center gap-1"><Sparkles size={13} className="text-[var(--pt-green-600)]" /> {shownPreview.filled_from_catalog} filled in from the catalogue</span>
                      )}
                    </>
                  )}
                </div>

                {shownPreview && shownPreview.duplicates > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-500/10 px-3 py-2.5 text-[13px] space-y-1.5">
                    <p className="font-medium flex items-center gap-1.5"><Copy size={14} /> {shownPreview.duplicates} row{shownPreview.duplicates === 1 ? " is" : "s are"} already in your products (or repeated in this file) — they won’t be added twice.</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      <label className="inline-flex items-center gap-1.5 cursor-pointer">
                        <input type="radio" name="dupe" checked={onDuplicate === "add_stock"} onChange={() => setOnDuplicate("add_stock")} />
                        Add their opening stock to the existing product
                      </label>
                      <label className="inline-flex items-center gap-1.5 cursor-pointer">
                        <input type="radio" name="dupe" checked={onDuplicate === "skip"} onChange={() => setOnDuplicate("skip")} />
                        Skip them
                      </label>
                    </div>
                  </div>
                )}

                <div className="overflow-x-auto rounded-lg border border-[var(--pt-border)] max-h-72 overflow-y-auto">
                  <table className="w-full text-[13px]">
                    <thead className="bg-[var(--pt-muted)] sticky top-0">
                      <tr>
                        {["Row", "Name", "Strength", "Price / unit", "Qty", "Expiry", "Status"].map((c) => (
                          <th key={c} className="px-3 py-2 text-left font-semibold text-[var(--pt-text-secondary)] whitespace-nowrap">{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {tableRows.map(({ row, info }) => {
                        const d = prepared[row - 1]?.data ?? {}
                        const local = prepared[row - 1]?.problems ?? []
                        const why = info?.error ?? (local.length ? local.join(", ") : null)
                        return (
                          <tr key={row} className="border-t border-[var(--pt-border)] align-top">
                            <td className="px-3 py-1.5 tabular-nums text-[var(--pt-text-tertiary)]">{row}</td>
                            <td className="px-3 py-1.5 whitespace-nowrap">{d.name || <span className="text-[var(--pt-text-tertiary)]">—</span>}</td>
                            <td className="px-3 py-1.5 whitespace-nowrap">{d.strength ?? ""}</td>
                            <td className="px-3 py-1.5 tabular-nums">{d.selling_price ?? ""}</td>
                            <td className="px-3 py-1.5 tabular-nums">{d.opening_qty ?? ""}</td>
                            <td className="px-3 py-1.5 whitespace-nowrap">{d.expiry_date ?? ""}</td>
                            <td className="px-3 py-1.5">
                              <span className="flex flex-col gap-0.5">
                                {info ? <span className={`self-start text-[11px] font-semibold rounded px-1.5 py-0.5 ${STATUS_STYLE[info.status]}`}>{STATUS_LABEL[info.status]}</span> : null}
                                {info?.match ? <span className="text-[11px] text-[var(--pt-text-secondary)]">matches {info.match}</span> : null}
                                {info?.filled ? <span className="text-[11px] text-[var(--pt-green-700)]">+ {info.filled.join(", ")} from catalogue</span> : null}
                                {why ? <span className="text-[11px] text-[var(--pt-red)]">{why}</span> : null}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                {localProblems > 0 && shownPreview && (
                  <p className="text-[12px] text-amber-600 dark:text-amber-400">⚠ {localProblems} row{localProblems === 1 ? " has" : "s have"} problems — fix them in your sheet and re-upload, or import the rest now.</p>
                )}
              </div>
            )}

            <div className="flex flex-wrap justify-between gap-2">
              <Button variant="outline" onClick={reset}>Choose another file</Button>
              <Button onClick={submit} disabled={!canImport} className="bg-[var(--pt-green)] hover:bg-[var(--pt-green-600)] text-white">
                {submitting ? <Loader2 size={15} className="animate-spin mr-1.5" /> : <CheckCircle2 size={15} className="mr-1.5" />}
                {shownPreview
                  ? `Import ${shownPreview.new} new product${shownPreview.new === 1 ? "" : "s"}${willAddStock ? ` + stock for ${willAddStock}` : ""}`
                  : "Import"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
