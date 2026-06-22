"use client"

import { useMemo, useRef, useState } from "react"
import { Loader2, X, Upload, Download, FileSpreadsheet, AlertTriangle, CheckCircle2 } from "lucide-react"
import { toast } from "sonner"
import { useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"

interface Props {
  branchId: string | null
  branchName?: string
  onClose: () => void
}

// Target fields the importer understands. `required` ones must be mapped.
const FIELDS: Array<{ key: string; label: string; required?: boolean; hint?: string }> = [
  { key: "name", label: "Name", required: true },
  { key: "selling_price", label: "Selling price", required: true, hint: "per unit, KES" },
  { key: "brand_name", label: "Brand" },
  { key: "manufacturer", label: "Manufacturer" },
  { key: "gtin", label: "Barcode / GTIN" },
  { key: "strength", label: "Strength" },
  { key: "dosage_form", label: "Dosage form" },
  { key: "base_unit", label: "Base unit", hint: "tablet, ml, bottle… (default: unit)" },
  { key: "category", label: "Department", hint: "e.g. OTC Medicines" },
  { key: "subcategory", label: "Subcategory", hint: "e.g. Pain & Fever" },
  { key: "units_per_pack", label: "Units per pack" },
  { key: "cost_price", label: "Cost price", hint: "per unit, KES" },
  { key: "reorder_level", label: "Reorder level" },
  { key: "is_controlled", label: "Controlled?", hint: "yes/no" },
  { key: "requires_prescription", label: "Requires Rx?", hint: "yes/no" },
  { key: "opening_qty", label: "Opening stock qty", hint: "needs branch + expiry" },
  { key: "batch_number", label: "Batch number" },
  { key: "expiry_date", label: "Expiry date", hint: "YYYY-MM-DD" },
]

const TEMPLATE_HEADERS = [
  "name", "brand_name", "manufacturer", "gtin", "strength", "dosage_form",
  "base_unit", "category", "subcategory", "units_per_pack", "cost_price", "selling_price", "reorder_level",
  "is_controlled", "requires_prescription", "opening_qty", "batch_number", "expiry_date",
]
const TEMPLATE_EXAMPLE = [
  "Paracetamol", "Panadol", "GSK", "", "500mg", "Tablet",
  "tablet", "OTC Medicines", "Pain & Fever", "1000", "1.50", "3.00", "100",
  "no", "no", "500", "B-2026-01", "2027-06-30",
]

/** Minimal RFC-4180 CSV parser: handles quoted fields, escaped quotes, CRLF. */
function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let field = ""
  let row: string[] = []
  let inQuotes = false
  // Strip a leading UTF-8 BOM if present.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else inQuotes = false
      } else field += c
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ",") {
      row.push(field); field = ""
    } else if (c === "\n") {
      row.push(field); rows.push(row); row = []; field = ""
    } else if (c === "\r") {
      // ignore; handled by \n
    } else field += c
  }
  // flush last field/row
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row) }
  return rows.filter((r) => r.some((c) => c.trim() !== ""))
}

function downloadTemplate() {
  const csv = [TEMPLATE_HEADERS.join(","), TEMPLATE_EXAMPLE.join(",")].join("\n")
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url; a.download = "pharmatrack-inventory-template.csv"; a.click()
  URL.revokeObjectURL(url)
}

// Guess a mapping from a source header to one of our field keys.
function autoMap(header: string): string | "" {
  const h = header.toLowerCase().replace(/[\s_-]+/g, "")
  const table: Record<string, string> = {
    name: "name", productname: "name", product: "name", item: "name", drug: "name",
    brand: "brand_name", brandname: "brand_name",
    manufacturer: "manufacturer", maker: "manufacturer",
    gtin: "gtin", barcode: "gtin", ean: "gtin",
    strength: "strength", dose: "strength",
    dosageform: "dosage_form", form: "dosage_form",
    baseunit: "base_unit", unit: "base_unit", uom: "base_unit",
    category: "category", department: "category", dept: "category",
    subcategory: "subcategory", subcat: "subcategory", subdepartment: "subcategory",
    unitsperpack: "units_per_pack", packsize: "units_per_pack",
    costprice: "cost_price", cost: "cost_price", buyprice: "cost_price",
    sellingprice: "selling_price", price: "selling_price", sellprice: "selling_price", retail: "selling_price",
    reorderlevel: "reorder_level", reorder: "reorder_level", minstock: "reorder_level",
    iscontrolled: "is_controlled", controlled: "is_controlled",
    requiresprescription: "requires_prescription", prescription: "requires_prescription", rx: "requires_prescription",
    openingqty: "opening_qty", openingstock: "opening_qty", quantity: "opening_qty", qty: "opening_qty", stock: "opening_qty",
    batchnumber: "batch_number", batch: "batch_number", lot: "batch_number",
    expirydate: "expiry_date", expiry: "expiry_date", expdate: "expiry_date", expiration: "expiry_date",
  }
  return table[h] ?? ""
}

type ImportResult = {
  created: number; stockBatches: number; failed: number; total: number
  errors: Array<{ row: number; name: string; error: string }>
}

export function BulkImportDialog({ branchId, branchName, onClose }: Props) {
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [dataRows, setDataRows] = useState<string[][]>([])
  const [mapping, setMapping] = useState<Record<string, string>>({}) // fieldKey -> header
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

  function handleFile(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      const rows = parseCSV(String(reader.result ?? ""))
      if (rows.length < 2) { toast.error("File has no data rows"); return }
      const hdr = rows[0]!.map((h) => h.trim())
      const body = rows.slice(1)
      setHeaders(hdr)
      setDataRows(body)
      // Auto-map: fieldKey -> matching header
      const m: Record<string, string> = {}
      hdr.forEach((h) => {
        const field = autoMap(h)
        if (field && !m[field]) m[field] = h
      })
      setMapping(m)
      setResult(null)
    }
    reader.readAsText(file)
  }

  // Build mapped row objects from the current column mapping.
  const mappedRows = useMemo(() => {
    if (!headers.length) return []
    const idx: Record<string, number> = {}
    for (const [field, header] of Object.entries(mapping)) {
      const i = headers.indexOf(header)
      if (i >= 0) idx[field] = i
    }
    return dataRows.map((cols) => {
      const obj: Record<string, string> = {}
      for (const [field, i] of Object.entries(idx)) obj[field] = (cols[i] ?? "").trim()
      return obj
    })
  }, [headers, dataRows, mapping])

  const nameMapped = !!mapping["name"]
  const priceMapped = !!mapping["selling_price"]
  const canImport = nameMapped && priceMapped && mappedRows.length > 0 && !submitting

  // Client-side preview of problems so users fix the file before importing.
  const validation = useMemo(() => {
    let invalid = 0
    const issues: string[] = []
    mappedRows.forEach((r, i) => {
      const rowIssues: string[] = []
      if (!r.name) rowIssues.push("missing name")
      const price = parseFloat(r.selling_price ?? "")
      if (!r.selling_price || isNaN(price) || price <= 0) rowIssues.push("invalid selling price")
      if (r.opening_qty && parseInt(r.opening_qty) > 0) {
        if (!branchId) rowIssues.push("opening stock needs a branch")
        if (!r.expiry_date) rowIssues.push("opening stock needs expiry date")
      }
      if (rowIssues.length) { invalid++; if (issues.length < 5) issues.push(`Row ${i + 1}: ${rowIssues.join(", ")}`) }
    })
    return { invalid, issues, valid: mappedRows.length - invalid }
  }, [mappedRows, branchId])

  async function submit() {
    setSubmitting(true)
    try {
      const res = await fetch("/api/inventory/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch_id: branchId ?? undefined, rows: mappedRows }),
      })
      const json = (await res.json()) as ImportResult & { error?: string }
      if (!res.ok) throw new Error(json.error ?? "Import failed")
      setResult(json)
      if (json.created > 0) {
        toast.success(`Imported ${json.created} product${json.created > 1 ? "s" : ""}`)
        await queryClient.invalidateQueries({ queryKey: ["inventory"] })
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed")
    } finally {
      setSubmitting(false)
    }
  }

  const previewCols = ["name", "strength", "selling_price", "opening_qty", "expiry_date"]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-[var(--pt-surface)] rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <FileSpreadsheet size={18} className="text-[var(--pt-green-600)]" />
            <h2 className="text-lg font-bold">Bulk import inventory</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--pt-muted-strong)] text-[var(--pt-text-secondary)]">
            <X size={16} />
          </button>
        </div>
        <p className="text-sm text-[var(--pt-text-secondary)] mb-5">
          Upload a CSV to add many products at once.{" "}
          {branchId ? <>Opening stock will be received at <span className="font-semibold">{branchName ?? "the active branch"}</span>.</> : "Select a branch first to also load opening stock."}
        </p>

        {/* Result view */}
        {result ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-[var(--pt-border)] p-4">
                <p className="text-[11px] uppercase tracking-wide text-[var(--pt-text-secondary)] font-semibold">Created</p>
                <p className="text-2xl font-bold text-[var(--pt-green-600)] tabular-nums">{result.created}</p>
              </div>
              <div className="rounded-xl border border-[var(--pt-border)] p-4">
                <p className="text-[11px] uppercase tracking-wide text-[var(--pt-text-secondary)] font-semibold">With stock</p>
                <p className="text-2xl font-bold tabular-nums">{result.stockBatches}</p>
              </div>
              <div className="rounded-xl border border-[var(--pt-border)] p-4">
                <p className="text-[11px] uppercase tracking-wide text-[var(--pt-text-secondary)] font-semibold">Issues</p>
                <p className={`text-2xl font-bold tabular-nums ${result.failed ? "text-[var(--pt-red)]" : ""}`}>{result.failed}</p>
              </div>
            </div>
            {result.errors.length > 0 && (
              <div className="rounded-lg border border-[var(--pt-border)] max-h-56 overflow-y-auto">
                {result.errors.map((e, i) => (
                  <div key={i} className="flex items-start gap-2 px-3 py-2 text-[13px] border-b border-[var(--pt-border)] last:border-b-0">
                    <AlertTriangle size={14} className="text-amber-500 mt-0.5 shrink-0" />
                    <span><span className="font-medium">Row {e.row}</span> ({e.name}): {e.error}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setResult(null); setHeaders([]); setDataRows([]); setMapping({}) }}>Import another file</Button>
              <Button onClick={onClose} className="bg-[var(--pt-green)] hover:bg-[var(--pt-green-600)] text-white">Done</Button>
            </div>
          </div>
        ) : headers.length === 0 ? (
          /* Upload step */
          <div className="space-y-4">
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full rounded-xl border-2 border-dashed border-[var(--pt-border-strong)] hover:border-[var(--pt-green)] hover:bg-[var(--pt-muted)] transition-colors py-10 flex flex-col items-center gap-2"
            >
              <Upload size={26} className="text-[var(--pt-text-tertiary)]" />
              <span className="text-sm font-semibold">Choose a CSV file</span>
              <span className="text-xs text-[var(--pt-text-tertiary)]">or drag it onto this window</span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = "" }}
            />
            <button onClick={downloadTemplate} className="flex items-center gap-1.5 text-sm font-medium text-[var(--pt-green-600)] hover:underline">
              <Download size={14} /> Download CSV template
            </button>
            <p className="text-xs text-[var(--pt-text-tertiary)]">
              Only <span className="font-semibold">name</span> and <span className="font-semibold">selling price</span> are required. Everything else is optional — including opening stock (quantity + expiry).
            </p>
          </div>
        ) : (
          /* Mapping + preview step */
          <div className="space-y-5">
            <div>
              <p className="text-sm font-semibold mb-2">Match your columns</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                {FIELDS.map((f) => (
                  <div key={f.key} className="flex items-center gap-2">
                    <label className="text-[13px] w-40 shrink-0">
                      {f.label}{f.required && <span className="text-[var(--pt-red)]">*</span>}
                      {f.hint && <span className="block text-[10px] text-[var(--pt-text-tertiary)]">{f.hint}</span>}
                    </label>
                    <select
                      value={mapping[f.key] ?? ""}
                      onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value }))}
                      className="flex-1 h-9 rounded-lg border border-[var(--pt-border)] px-2 text-[13px] bg-[var(--pt-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--pt-green)]"
                    >
                      <option value="">— skip —</option>
                      {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {(!nameMapped || !priceMapped) && (
              <p className="text-[13px] text-[var(--pt-red)] bg-[var(--pt-red-50)] px-3 py-2 rounded-lg">
                Map both <span className="font-semibold">Name</span> and <span className="font-semibold">Selling price</span> to continue.
              </p>
            )}

            {/* Preview */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold">Preview <span className="font-normal text-[var(--pt-text-tertiary)]">({mappedRows.length} rows)</span></p>
                <span className="text-[12px] text-[var(--pt-text-secondary)]">
                  <span className="text-[var(--pt-green-600)] font-semibold">{validation.valid} ready</span>
                  {validation.invalid > 0 && <span className="text-[var(--pt-red)] font-semibold"> · {validation.invalid} with issues</span>}
                </span>
              </div>
              <div className="overflow-x-auto rounded-lg border border-[var(--pt-border)]">
                <table className="w-full text-[13px]">
                  <thead className="bg-[var(--pt-muted)]">
                    <tr>{previewCols.map((c) => <th key={c} className="px-3 py-2 text-left font-semibold text-[var(--pt-text-secondary)] whitespace-nowrap">{c}</th>)}</tr>
                  </thead>
                  <tbody>
                    {mappedRows.slice(0, 6).map((r, i) => (
                      <tr key={i} className="border-t border-[var(--pt-border)]">
                        {previewCols.map((c) => <td key={c} className="px-3 py-1.5 whitespace-nowrap">{r[c] || <span className="text-[var(--pt-text-tertiary)]">—</span>}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {validation.issues.length > 0 && (
                <ul className="mt-2 space-y-0.5">
                  {validation.issues.map((s, i) => <li key={i} className="text-[12px] text-amber-600 dark:text-amber-400">⚠ {s}</li>)}
                </ul>
              )}
            </div>

            <div className="flex justify-between gap-2">
              <Button variant="outline" onClick={() => { setHeaders([]); setDataRows([]); setMapping({}) }}>Choose another file</Button>
              <Button onClick={submit} disabled={!canImport} className="bg-[var(--pt-green)] hover:bg-[var(--pt-green-600)] text-white">
                {submitting ? <Loader2 size={15} className="animate-spin mr-1.5" /> : <CheckCircle2 size={15} className="mr-1.5" />}
                Import {validation.valid} product{validation.valid !== 1 ? "s" : ""}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
