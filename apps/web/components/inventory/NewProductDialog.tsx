"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { z } from "zod"
import { toast } from "sonner"
import { AlertTriangle, Search, Check, Sparkles, Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CategorySelect } from "./CategorySelect"
import type { ProductWithStock } from "@pharmatrack/types"

interface NewProductDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  prefill?: {
    gtin?: string
    batchNumber?: string
    expiryDate?: Date
    name?: string
    manufacturer?: string
  }
  /** When set, an opening-stock batch can be received at this branch. */
  branchId: string
  suppliers: Array<{ id: string; name: string }>
  onCreated: (product: ProductWithStock) => void
}

const DOSAGE_FORMS = ["Tablet", "Capsule", "Syrup", "Suspension", "Cream", "Gel", "Ointment", "Lotion", "Injection", "Drops", "Inhaler", "Sachet", "Other"]
const BASE_UNITS = ["tablet", "capsule", "ml", "g", "unit", "bottle", "tube", "sachet", "pack", "vial", "inhaler", "piece"]

interface CatalogItem {
  id: string
  name: string
  brand_name: string | null
  manufacturer: string | null
  gtin: string | null
  strength: string | null
  dosage_form: string | null
  base_unit: string
  pack_label: string | null
  units_per_pack: number
  is_controlled: boolean
  requires_prescription: boolean
}

// Sensible base unit for a chosen dosage form (only applied until the user edits it)
function defaultBaseUnit(dosageForm: string): string {
  switch (dosageForm) {
    case "Tablet": return "tablet"
    case "Capsule": return "capsule"
    case "Syrup":
    case "Suspension":
    case "Drops": return "ml"
    case "Cream":
    case "Gel":
    case "Ointment": return "g"
    case "Lotion": return "ml"
    case "Injection": return "vial"
    case "Sachet": return "sachet"
    case "Inhaler": return "unit"
    default: return "unit"
  }
}

const schema = z.object({
  name: z.string().min(1, "Generic name is required"),
  dosage_form: z.string().min(1, "Dosage form is required"),
  base_unit: z.string().min(1, "Base unit is required"),
  selling_price: z.number().positive("Selling price is required"),
  max_discount_percent: z.number().min(0).max(100).nullable().optional(),
})

const batchSchema = z.object({
  batch_number: z.string().min(1, "Batch number is required"),
  expiry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  quantity_received: z.number().int().positive("Quantity must be at least 1"),
})

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null
  return <p className="text-xs text-[var(--pt-red)] mt-1">{msg}</p>
}

function Toggle({ label, description, checked, onChange }: { label: string; description?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 p-3 rounded-lg border border-[var(--pt-border)] cursor-pointer hover:bg-[var(--pt-muted)] transition-colors">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {description && <p className="text-xs text-[var(--pt-text-secondary)]">{description}</p>}
      </div>
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
        className={`w-11 h-6 rounded-full transition-colors shrink-0 ${checked ? "bg-[var(--pt-green)]" : "bg-[var(--pt-border)]"}`}>
        <span className={`block w-4 h-4 rounded-full bg-[var(--pt-surface)] shadow transition-transform mx-1 ${checked ? "translate-x-5" : "translate-x-0"}`} />
      </button>
    </label>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[11px] font-bold text-[var(--pt-text-secondary)] uppercase tracking-wider">{children}</h3>
}

export function NewProductDialog({ open, onOpenChange, prefill, branchId, suppliers, onCreated }: NewProductDialogProps) {
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isPending, startTransition] = useTransition()

  // Identity
  const [name, setName] = useState(prefill?.name ?? "")
  const [brandName, setBrandName] = useState("")
  const [manufacturer, setManufacturer] = useState(prefill?.manufacturer ?? "")
  const [gtin, setGtin] = useState(prefill?.gtin ?? "")

  // Classification
  const [strength, setStrength] = useState("")
  const [dosageForm, setDosageForm] = useState("")
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [requiresPrescription, setRequiresPrescription] = useState(false)
  const [isControlled, setIsControlled] = useState(false)

  // Units & pricing
  const [baseUnit, setBaseUnit] = useState("tablet")
  const baseUnitTouched = useRef(false)
  const [packLabel, setPackLabel] = useState("")
  const [unitsPerPack, setUnitsPerPack] = useState(1)
  const [packCost, setPackCost] = useState("")
  const [costPrice, setCostPrice] = useState("")
  const [sellingPrice, setSellingPrice] = useState("")
  const [reorderLevel, setReorderLevel] = useState(10)
  const [maxDiscountPercent, setMaxDiscountPercent] = useState("")

  // Opening stock (optional)
  const [addStock, setAddStock] = useState(false)
  const [batchNumber, setBatchNumber] = useState(prefill?.batchNumber ?? "")
  const [expiryDate, setExpiryDate] = useState(prefill?.expiryDate ? prefill.expiryDate.toISOString().slice(0, 10) : "")
  const [quantityReceived, setQuantityReceived] = useState(1)
  const [supplierId, setSupplierId] = useState("")

  // Drug catalog autofill — search the shared reference list and prefill identity.
  const [catalogQuery, setCatalogQuery] = useState("")
  const [catalogResults, setCatalogResults] = useState<CatalogItem[]>([])
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [pickedName, setPickedName] = useState<string | null>(null)

  useEffect(() => {
    const q = catalogQuery.trim()
    let active = true
    const t = setTimeout(async () => {
      if (q.length < 1) { if (active) { setCatalogResults([]); setCatalogOpen(false) } return }
      if (active) setCatalogLoading(true)
      try {
        const res = await fetch(`/api/catalog?q=${encodeURIComponent(q)}`)
        if (!res.ok) return
        const json = (await res.json()) as { items: CatalogItem[] }
        if (active) { setCatalogResults(json.items); setCatalogOpen(true) }
      } finally {
        if (active) setCatalogLoading(false)
      }
    }, 250)
    return () => { active = false; clearTimeout(t) }
  }, [catalogQuery])

  function applyCatalogItem(item: CatalogItem) {
    setName(item.name)
    setBrandName(item.brand_name ?? "")
    setManufacturer(item.manufacturer ?? "")
    setGtin(item.gtin ?? "")
    setStrength(item.strength ?? "")
    // Keep the dosage-form select valid; fall back to "Other" for niche forms.
    setDosageForm(item.dosage_form && DOSAGE_FORMS.includes(item.dosage_form) ? item.dosage_form : (item.dosage_form ? "Other" : ""))
    baseUnitTouched.current = true
    setBaseUnit(BASE_UNITS.includes(item.base_unit) ? item.base_unit : "unit")
    if (item.pack_label) setPackLabel(item.pack_label)
    if (item.units_per_pack) setUnitsPerPack(item.units_per_pack)
    setIsControlled(item.is_controlled)
    setRequiresPrescription(item.requires_prescription)
    setPickedName(`${item.name}${item.strength ? " " + item.strength : ""}`)
    setCatalogOpen(false)
    setCatalogQuery("")
  }

  const costPerUnit = packCost && unitsPerPack > 0 ? parseFloat(packCost) / unitsPerPack : parseFloat(costPrice)
  const margin = costPerUnit > 0 && parseFloat(sellingPrice) > 0
    ? (((parseFloat(sellingPrice) - costPerUnit) / parseFloat(sellingPrice)) * 100).toFixed(1)
    : null

  function onDosageChange(v: string) {
    setDosageForm(v)
    if (!baseUnitTouched.current) setBaseUnit(defaultBaseUnit(v))
  }

  function handleSubmit() {
    const base = schema.safeParse({
      name,
      dosage_form: dosageForm,
      base_unit: baseUnit,
      selling_price: parseFloat(sellingPrice),
      max_discount_percent: maxDiscountPercent !== "" ? parseFloat(maxDiscountPercent) : null,
    })
    const errs: Record<string, string> = {}
    if (!base.success) base.error.issues.forEach((i) => { errs[i.path[0]?.toString() ?? "form"] = i.message })
    if (addStock) {
      const b = batchSchema.safeParse({ batch_number: batchNumber, expiry_date: expiryDate, quantity_received: quantityReceived })
      if (!b.success) b.error.issues.forEach((i) => { errs[i.path[0]?.toString() ?? "form"] = i.message })
    }
    if (Object.keys(errs).length > 0) { setErrors(errs); return }
    setErrors({})

    startTransition(async () => {
      try {
        const productRes = await fetch("/api/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            brand_name: brandName || undefined,
            manufacturer: manufacturer || undefined,
            gtin: gtin || undefined,
            strength: strength || undefined,
            dosage_form: dosageForm,
            category_id: categoryId || undefined,
            supplier_id: supplierId || undefined,
            requires_prescription: requiresPrescription,
            is_controlled: isControlled,
            base_unit: baseUnit,
            pack_label: packLabel || undefined,
            units_per_pack: unitsPerPack,
            cost_price: costPerUnit > 0 ? costPerUnit : undefined,
            selling_price: parseFloat(sellingPrice),
            reorder_level: reorderLevel,
            max_discount_percent: maxDiscountPercent !== "" ? parseFloat(maxDiscountPercent) : null,
          }),
        })
        const productData = (await productRes.json()) as { product?: { id: string }; error?: string }
        if (!productRes.ok || !productData.product) {
          toast.error(productData.error ?? "Failed to create product")
          return
        }
        const product = productData.product

        if (addStock && branchId) {
          const batchRes = await fetch("/api/batches", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              product_id: product.id,
              branch_id: branchId,
              batch_number: batchNumber,
              expiry_date: expiryDate,
              quantity_received: quantityReceived,
              cost_price: costPerUnit > 0 ? costPerUnit : undefined,
              supplier_id: supplierId || undefined,
            }),
          })
          if (!batchRes.ok) {
            const bd = (await batchRes.json()) as { error?: string }
            toast.error(bd.error ?? "Product created, but opening stock failed")
            return
          }
        }

        toast.success(`${name} added`)
        onCreated({
          ...(product as unknown as ProductWithStock),
          // products table returns `id`; the cart/sale expect `product_id`.
          product_id: product.id,
          stock_on_hand: addStock ? quantityReceived : 0,
          earliest_expiry: addStock ? expiryDate : null,
          batch_count: addStock ? 1 : 0,
        })
        onOpenChange(false)
      } catch {
        toast.error("An unexpected error occurred")
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add product</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Catalog autofill */}
          <div className="rounded-lg border border-[var(--pt-green-100)] bg-[var(--pt-green-50)] p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Sparkles size={14} className="text-[var(--pt-green-600)]" />
              <span className="text-xs font-semibold text-[var(--pt-green-700)] uppercase tracking-wide">Quick start from catalog</span>
            </div>
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--pt-text-tertiary)] pointer-events-none" />
              <Input
                value={catalogQuery}
                onChange={(e) => { setCatalogQuery(e.target.value); setPickedName(null) }}
                onFocus={() => { if (catalogResults.length) setCatalogOpen(true) }}
                placeholder="Search e.g. Paracetamol, Amoxil, Amlodipine…"
                className="h-10 pl-9 bg-[var(--pt-surface)]"
              />
              {catalogLoading && <Loader2 size={15} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-[var(--pt-text-tertiary)]" />}
              {catalogOpen && catalogResults.length > 0 && (
                <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border border-[var(--pt-border)] bg-[var(--pt-surface)] shadow-lg">
                  {catalogResults.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => applyCatalogItem(item)}
                      className="w-full text-left px-3 py-2 hover:bg-[var(--pt-muted)] transition-colors border-b border-[var(--pt-border)] last:border-b-0"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium truncate">
                          {item.name}{item.strength ? ` ${item.strength}` : ""}
                        </span>
                        <span className="text-[11px] text-[var(--pt-text-tertiary)] shrink-0">{item.dosage_form ?? ""}</span>
                      </div>
                      <div className="flex gap-1.5 mt-0.5">
                        {item.requires_prescription && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300">Rx</span>}
                        {item.is_controlled && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300">Controlled</span>}
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--pt-muted-strong)] text-[var(--pt-text-secondary)]">per {item.base_unit}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {pickedName ? (
              <p className="flex items-center gap-1.5 mt-1.5 text-[12px] text-[var(--pt-green-700)]">
                <Check size={13} /> Autofilled <span className="font-semibold">{pickedName}</span> — just set price &amp; stock below.
              </p>
            ) : (
              <p className="mt-1.5 text-[11px] text-[var(--pt-text-tertiary)]">Pick a product to autofill its details, or type everything manually below.</p>
            )}
          </div>

          {/* Identity */}
          <div className="space-y-4">
            <SectionTitle>Identity</SectionTitle>
            <div>
              <Label htmlFor="name" className="text-sm font-medium">Generic name *</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Amoxicillin" className="mt-1.5 h-10" autoFocus />
              <FieldError msg={errors["name"]} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="brand_name" className="text-sm font-medium">Brand name</Label>
                <Input id="brand_name" value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="e.g. Amoxil" className="mt-1.5 h-10" />
              </div>
              <div>
                <Label htmlFor="manufacturer" className="text-sm font-medium">Manufacturer</Label>
                <Input id="manufacturer" value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} className="mt-1.5 h-10" />
              </div>
            </div>
            <div>
              <Label htmlFor="gtin" className="text-sm font-medium">GTIN / Barcode{prefill?.gtin && " (from scan)"}</Label>
              <Input id="gtin" value={gtin} onChange={(e) => setGtin(e.target.value)} placeholder="EAN-13 or barcode" readOnly={!!prefill?.gtin} className={`mt-1.5 h-10 ${prefill?.gtin ? "bg-[var(--pt-muted)]" : ""}`} />
            </div>
          </div>

          {/* Classification */}
          <div className="space-y-4">
            <SectionTitle>Classification</SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="strength" className="text-sm font-medium">Strength</Label>
                <Input id="strength" value={strength} onChange={(e) => setStrength(e.target.value)} placeholder="500mg" className="mt-1.5 h-10" />
              </div>
              <div>
                <Label className="text-sm font-medium">Dosage form *</Label>
                <Select value={dosageForm} onValueChange={(v) => { if (v !== null) onDosageChange(v) }}>
                  <SelectTrigger className="mt-1.5 h-10"><SelectValue placeholder="Select form…" /></SelectTrigger>
                  <SelectContent>{DOSAGE_FORMS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                </Select>
                <FieldError msg={errors["dosage_form"]} />
              </div>
            </div>
            <CategorySelect value={categoryId} onChange={setCategoryId} />
            <div className="space-y-2 pt-1">
              <Toggle label="Requires prescription" description="Patient must present a valid Rx" checked={requiresPrescription} onChange={setRequiresPrescription} />
              <Toggle label="Controlled substance" description="Narcotic or psychotropic — narcotics register required" checked={isControlled} onChange={setIsControlled} />
              {isControlled && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-500/15 border border-amber-200 rounded-lg text-sm text-amber-800">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                  <span>This product will be tracked in the controlled substances narcotics register as required by PPB.</span>
                </div>
              )}
            </div>
          </div>

          {/* Units & Pricing */}
          <div className="space-y-4">
            <SectionTitle>Units & Pricing</SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm font-medium">Base unit *</Label>
                <Select value={baseUnit} onValueChange={(v) => { if (v !== null) { baseUnitTouched.current = true; setBaseUnit(v) } }}>
                  <SelectTrigger className="mt-1.5 h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>{BASE_UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="pack_label" className="text-sm font-medium">Pack label</Label>
                <Input id="pack_label" value={packLabel} onChange={(e) => setPackLabel(e.target.value)} placeholder="Box, Bottle…" className="mt-1.5 h-10" />
              </div>
            </div>
            <div>
              <Label htmlFor="units_per_pack" className="text-sm font-medium">{baseUnit}s per pack</Label>
              <Input id="units_per_pack" type="number" min={1} value={unitsPerPack} onChange={(e) => setUnitsPerPack(parseInt(e.target.value) || 1)} className="mt-1.5 h-10" />
            </div>

            <div className="bg-[var(--pt-muted)] rounded-lg p-3 space-y-3 border border-[var(--pt-border)]">
              <p className="text-xs font-semibold text-[var(--pt-text-secondary)] uppercase tracking-wide">Cost price</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="pack_cost" className="text-xs text-[var(--pt-text-secondary)]">Pack cost (KES)</Label>
                  <Input id="pack_cost" type="number" min={0} step="0.01" placeholder="0.00" value={packCost} onChange={(e) => { setPackCost(e.target.value); setCostPrice("") }} className="mt-1 h-9 text-sm" />
                </div>
                <div>
                  <Label htmlFor="cost_price" className="text-xs text-[var(--pt-text-secondary)]">Per {baseUnit} (KES)</Label>
                  <Input id="cost_price" type="number" min={0} step="0.01" placeholder="0.00"
                    value={packCost && unitsPerPack > 0 ? (parseFloat(packCost) / unitsPerPack).toFixed(2) : costPrice}
                    readOnly={!!packCost} onChange={(e) => { setCostPrice(e.target.value); setPackCost("") }} className="mt-1 h-9 text-sm" />
                </div>
              </div>
            </div>

            <div>
              <div className="flex justify-between items-baseline">
                <Label htmlFor="selling_price" className="text-sm font-medium">Selling price per {baseUnit} (KES) *</Label>
                {margin !== null && (
                  <span className={`text-xs font-semibold ${parseFloat(margin) >= 20 ? "text-[var(--pt-green)]" : parseFloat(margin) >= 0 ? "text-amber-600 dark:text-amber-400" : "text-[var(--pt-red)]"}`}>{margin}% margin</span>
                )}
              </div>
              <Input id="selling_price" type="number" min={0} step="0.01" placeholder="0.00" value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value)} className="mt-1.5 h-10" />
              <FieldError msg={errors["selling_price"]} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="reorder_level" className="text-sm font-medium">Reorder level (in {baseUnit}s)</Label>
                <Input id="reorder_level" type="number" min={0} value={reorderLevel} onChange={(e) => setReorderLevel(parseInt(e.target.value) || 0)} className="mt-1.5 h-10" />
              </div>
              <div>
                <Label htmlFor="max_discount" className="text-sm font-medium">Max discount %</Label>
                <Input id="max_discount" type="number" min={0} max={100} step="0.1" placeholder="No limit" value={maxDiscountPercent} onChange={(e) => setMaxDiscountPercent(e.target.value)} className="mt-1.5 h-10" />
                <FieldError msg={errors["max_discount_percent"]} />
              </div>
            </div>

            {suppliers.length > 0 && (
              <div>
                <Label className="text-sm font-medium">Default supplier</Label>
                <Select value={supplierId} onValueChange={(v) => { if (v !== null) setSupplierId(v) }}>
                  <SelectTrigger className="mt-1.5 h-10"><SelectValue placeholder="Select supplier…" /></SelectTrigger>
                  <SelectContent>{suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
                <p className="text-xs text-[var(--pt-text-tertiary)] mt-1">Who you usually order this from. Also used for any opening stock below.</p>
              </div>
            )}
          </div>

          {/* Opening stock (optional) */}
          <div className="space-y-4">
            <SectionTitle>Opening Stock</SectionTitle>
            {branchId ? (
              <>
                <Toggle label="Receive opening stock now" description="Otherwise add a batch later from Inventory → Receive" checked={addStock} onChange={setAddStock} />
                {addStock && (
                  <div className="space-y-4 border-l-2 border-[var(--pt-green-100)] pl-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor="batch_number" className="text-sm font-medium">Batch number *</Label>
                        <Input id="batch_number" value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} placeholder="BCH2024001" className="mt-1.5 h-10" />
                        <FieldError msg={errors["batch_number"]} />
                      </div>
                      <div>
                        <Label htmlFor="expiry_date" className="text-sm font-medium">Expiry date *</Label>
                        <Input id="expiry_date" type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} min={new Date().toISOString().slice(0, 10)} className="mt-1.5 h-10" />
                        <FieldError msg={errors["expiry_date"]} />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="quantity_received" className="text-sm font-medium">Quantity received (in {baseUnit}s) *</Label>
                      <Input id="quantity_received" type="number" min={1} value={quantityReceived} onChange={(e) => setQuantityReceived(parseInt(e.target.value) || 1)} className="mt-1.5 h-10" />
                      {unitsPerPack > 1 && quantityReceived > 0 && (
                        <p className="text-xs text-[var(--pt-text-secondary)] mt-1">= {Math.floor(quantityReceived / unitsPerPack)} packs × {unitsPerPack} {baseUnit}s</p>
                      )}
                      <FieldError msg={errors["quantity_received"]} />
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-[var(--pt-text-tertiary)] italic">Add stock later from Inventory → Receive.</p>
            )}
          </div>
        </div>

        <div className="flex gap-2 pt-4 border-t border-[var(--pt-border)] mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">Cancel</Button>
          <Button onClick={handleSubmit} disabled={isPending} className="flex-1 bg-[var(--pt-green)] hover:bg-[var(--pt-green-600)] text-white font-semibold">
            {isPending ? "Saving…" : addStock && branchId ? "Add product & stock" : "Add product"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
