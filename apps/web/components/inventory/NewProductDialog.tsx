"use client"

import { useState, useTransition } from "react"
import { z } from "zod"
import { toast } from "sonner"
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
import { Badge } from "@/components/ui/badge"
import { AlertTriangle } from "lucide-react"
import type { ProductWithStock } from "@pharmatrack/types"

// ─── Types ──────────────────────────────────────────────────────────────────

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
  branchId: string
  categories: Array<{ id: string; name: string }>
  suppliers: Array<{ id: string; name: string }>
  onCreated: (product: ProductWithStock) => void
}

const DOSAGE_FORMS = [
  "Tablet", "Capsule", "Syrup", "Cream", "Gel",
  "Injection", "Drops", "Inhaler", "Sachet", "Other",
]
const BASE_UNITS = ["tablet", "capsule", "ml", "g", "unit"]

// ─── Step schemas ────────────────────────────────────────────────────────────

const step1Schema = z.object({
  name: z.string().min(1, "Generic name is required"),
  brand_name: z.string().optional(),
  manufacturer: z.string().optional(),
  gtin: z.string().optional(),
})

const step2Schema = z.object({
  strength: z.string().optional(),
  dosage_form: z.string().min(1, "Dosage form is required"),
  category_id: z.string().optional(),
  requires_prescription: z.boolean(),
  is_controlled: z.boolean(),
})

const step3Schema = z.object({
  base_unit: z.string().min(1, "Base unit is required"),
  pack_label: z.string().optional(),
  units_per_pack: z.number().int().positive("Must be at least 1"),
  cost_price: z.number().nonnegative().optional(),
  selling_price: z.number().positive("Selling price is required"),
  reorder_level: z.number().int().nonnegative(),
  max_discount_percent: z.number().min(0).max(100).nullable().optional(),
})

const step4Schema = z.object({
  batch_number: z.string().min(1, "Batch number is required"),
  expiry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format"),
  quantity_received: z.number().int().positive("Quantity must be at least 1"),
  supplier_id: z.string().optional(),
})

// ─── Shared helpers ──────────────────────────────────────────────────────────

function ToggleField({
  label,
  checked,
  onChange,
  description,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  description?: string
}) {
  return (
    <label className="flex items-center justify-between gap-3 p-3 rounded-lg border border-[var(--pt-border)] cursor-pointer hover:bg-gray-50 transition-colors">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {description && <p className="text-xs text-[var(--pt-text-secondary)]">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={[
          "w-11 h-6 rounded-full transition-colors shrink-0",
          checked ? "bg-[var(--pt-green)]" : "bg-gray-200",
        ].join(" ")}
      >
        <span
          className={[
            "block w-4 h-4 rounded-full bg-white shadow transition-transform mx-1",
            checked ? "translate-x-5" : "translate-x-0",
          ].join(" ")}
        />
      </button>
    </label>
  )
}

function StepIndicator({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center gap-2 mb-5">
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div
            className={[
              "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors",
              i + 1 < step
                ? "bg-[var(--pt-green)] text-white"
                : i + 1 === step
                  ? "bg-[var(--pt-green)] text-white ring-2 ring-[var(--pt-green-50)] ring-offset-1"
                  : "bg-gray-100 text-[var(--pt-text-secondary)]",
            ].join(" ")}
          >
            {i + 1 < step ? "✓" : i + 1}
          </div>
          {i < total - 1 && (
            <div
              className={[
                "h-px w-8 transition-colors",
                i + 1 < step ? "bg-[var(--pt-green)]" : "bg-gray-200",
              ].join(" ")}
            />
          )}
        </div>
      ))}
      <span className="ml-2 text-xs text-[var(--pt-text-secondary)]">Step {step} of {total}</span>
    </div>
  )
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null
  return <p className="text-xs text-[var(--pt-red)] mt-1">{msg}</p>
}

// ─── Main component ──────────────────────────────────────────────────────────

export function NewProductDialog({
  open,
  onOpenChange,
  prefill,
  branchId,
  categories,
  suppliers,
  onCreated,
}: NewProductDialogProps) {
  const [step, setStep] = useState(1)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isPending, startTransition] = useTransition()

  // Step 1 state
  const [name, setName] = useState(prefill?.name ?? "")
  const [brandName, setBrandName] = useState("")
  const [manufacturer, setManufacturer] = useState(prefill?.manufacturer ?? "")
  const [gtin, setGtin] = useState(prefill?.gtin ?? "")

  // Step 2 state
  const [strength, setStrength] = useState("")
  const [dosageForm, setDosageForm] = useState("")
  const [categoryId, setCategoryId] = useState("")
  const [requiresPrescription, setRequiresPrescription] = useState(false)
  const [isControlled, setIsControlled] = useState(false)

  // Step 3 state
  const [baseUnit, setBaseUnit] = useState("tablet")
  const [packLabel, setPackLabel] = useState("")
  const [unitsPerPack, setUnitsPerPack] = useState(1)
  const [packCost, setPackCost] = useState("") // helper field
  const [costPrice, setCostPrice] = useState("")
  const [sellingPrice, setSellingPrice] = useState("")
  const [reorderLevel, setReorderLevel] = useState(10)
  const [maxDiscountPercent, setMaxDiscountPercent] = useState("")

  // Step 4 state
  const [batchNumber, setBatchNumber] = useState(prefill?.batchNumber ?? "")
  const [expiryDate, setExpiryDate] = useState(
    prefill?.expiryDate ? prefill.expiryDate.toISOString().slice(0, 10) : "",
  )
  const [quantityReceived, setQuantityReceived] = useState(1)
  const [supplierId, setSupplierId] = useState("")

  // Derived
  const costPerUnit =
    packCost && unitsPerPack > 0 ? parseFloat(packCost) / unitsPerPack : parseFloat(costPrice)
  const margin =
    costPerUnit > 0 && parseFloat(sellingPrice) > 0
      ? (((parseFloat(sellingPrice) - costPerUnit) / parseFloat(sellingPrice)) * 100).toFixed(1)
      : null

  function validate(s: number): boolean {
    let result: { success: boolean; error?: { issues: Array<{ path: Array<string | number | symbol>; message: string }> } }
    switch (s) {
      case 1:
        result = step1Schema.safeParse({ name, brand_name: brandName, manufacturer, gtin })
        break
      case 2:
        result = step2Schema.safeParse({
          strength,
          dosage_form: dosageForm,
          category_id: categoryId || undefined,
          requires_prescription: requiresPrescription,
          is_controlled: isControlled,
        })
        break
      case 3:
        result = step3Schema.safeParse({
          base_unit: baseUnit,
          pack_label: packLabel || undefined,
          units_per_pack: unitsPerPack,
          cost_price: costPerUnit > 0 ? costPerUnit : undefined,
          selling_price: parseFloat(sellingPrice),
          reorder_level: reorderLevel,
          max_discount_percent: maxDiscountPercent !== "" ? parseFloat(maxDiscountPercent) : null,
        })
        break
      case 4:
        result = step4Schema.safeParse({
          batch_number: batchNumber,
          expiry_date: expiryDate,
          quantity_received: quantityReceived,
          supplier_id: supplierId || undefined,
        })
        break
      default:
        return true
    }
    if (!result.success) {
      const errs: Record<string, string> = {}
      result.error?.issues.forEach((issue) => {
        const key = issue.path[0]?.toString() ?? "form"
        errs[key] = issue.message
      })
      setErrors(errs)
      return false
    }
    setErrors({})
    return true
  }

  function next() {
    if (!validate(step)) return
    setStep((s) => s + 1)
  }

  function back() {
    setErrors({})
    setStep((s) => s - 1)
  }

  function handleSubmit() {
    if (!validate(4)) return

    startTransition(async () => {
      try {
        // Create product
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

        const productData = (await productRes.json()) as { product?: Record<string, unknown>; error?: string }
        if (!productRes.ok) {
          toast.error(productData.error ?? "Failed to create product")
          return
        }

        const product = productData.product as { id: string }

        // Create first batch
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
          const batchData = (await batchRes.json()) as { error?: string }
          toast.error(batchData.error ?? "Product created but batch failed")
          return
        }

        toast.success(`${name} registered successfully`)
        onCreated({
          ...(product as unknown as ProductWithStock),
          stock_on_hand: quantityReceived,
          earliest_expiry: expiryDate,
          batch_count: 1,
        })
        onOpenChange(false)
      } catch {
        toast.error("An unexpected error occurred")
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Register new product</DialogTitle>
        </DialogHeader>

        <StepIndicator step={step} total={4} />

        {/* ── Step 1: Identity ── */}
        {step === 1 && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-[var(--pt-text-secondary)] uppercase tracking-wide">
              Product Identity
            </h3>
            <div>
              <Label htmlFor="name" className="text-sm font-medium">Generic name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Amoxicillin"
                className="mt-1.5 h-10"
                autoFocus
              />
              <FieldError msg={errors["name"]} />
            </div>
            <div>
              <Label htmlFor="brand_name" className="text-sm font-medium">Brand name</Label>
              <Input
                id="brand_name"
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                placeholder="e.g. Amoxil"
                className="mt-1.5 h-10"
              />
            </div>
            <div>
              <Label htmlFor="manufacturer" className="text-sm font-medium">Manufacturer</Label>
              <Input
                id="manufacturer"
                value={manufacturer}
                onChange={(e) => setManufacturer(e.target.value)}
                className="mt-1.5 h-10"
              />
            </div>
            <div>
              <Label htmlFor="gtin" className="text-sm font-medium">
                GTIN / Barcode{prefill?.gtin && " (from scan)"}
              </Label>
              <Input
                id="gtin"
                value={gtin}
                onChange={(e) => setGtin(e.target.value)}
                placeholder="EAN-13 or barcode"
                readOnly={!!prefill?.gtin}
                className={["mt-1.5 h-10", prefill?.gtin ? "bg-gray-50" : ""].join(" ")}
              />
            </div>
          </div>
        )}

        {/* ── Step 2: Pharmaceutical details ── */}
        {step === 2 && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-[var(--pt-text-secondary)] uppercase tracking-wide">
              Pharmaceutical Details
            </h3>
            <div>
              <Label htmlFor="strength" className="text-sm font-medium">Strength</Label>
              <Input
                id="strength"
                value={strength}
                onChange={(e) => setStrength(e.target.value)}
                placeholder="e.g. 500mg or 250mg/5ml"
                className="mt-1.5 h-10"
                autoFocus
              />
            </div>
            <div>
              <Label className="text-sm font-medium">Dosage form *</Label>
              <Select value={dosageForm} onValueChange={(v) => { if (v !== null) setDosageForm(v) }}>
                <SelectTrigger className="mt-1.5 h-10">
                  <SelectValue placeholder="Select form…" />
                </SelectTrigger>
                <SelectContent>
                  {DOSAGE_FORMS.map((f) => (
                    <SelectItem key={f} value={f}>{f}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError msg={errors["dosage_form"]} />
            </div>
            {categories.length > 0 && (
              <div>
                <Label className="text-sm font-medium">Category</Label>
                <Select value={categoryId} onValueChange={(v) => { if (v !== null) setCategoryId(v) }}>
                  <SelectTrigger className="mt-1.5 h-10">
                    <SelectValue placeholder="Select category…" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2 pt-1">
              <ToggleField
                label="Requires prescription"
                checked={requiresPrescription}
                onChange={setRequiresPrescription}
                description="Patient must present a valid Rx"
              />
              <ToggleField
                label="Controlled substance"
                checked={isControlled}
                onChange={setIsControlled}
                description="Narcotic or psychotropic — narcotics register required"
              />
              {isControlled && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                  <span>
                    This product will be tracked in the controlled substances narcotics register as
                    required by PPB.
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Step 3: Units & Pricing ── */}
        {step === 3 && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-[var(--pt-text-secondary)] uppercase tracking-wide">
              Units & Pricing
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm font-medium">Base unit *</Label>
                <Select value={baseUnit} onValueChange={(v) => { if (v !== null) setBaseUnit(v) }}>
                  <SelectTrigger className="mt-1.5 h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BASE_UNITS.map((u) => (
                      <SelectItem key={u} value={u}>{u}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="pack_label" className="text-sm font-medium">Pack label</Label>
                <Input
                  id="pack_label"
                  value={packLabel}
                  onChange={(e) => setPackLabel(e.target.value)}
                  placeholder="Box, Bottle…"
                  className="mt-1.5 h-10"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="units_per_pack" className="text-sm font-medium">
                {baseUnit}s per pack
              </Label>
              <Input
                id="units_per_pack"
                type="number"
                min={1}
                value={unitsPerPack}
                onChange={(e) => setUnitsPerPack(parseInt(e.target.value) || 1)}
                className="mt-1.5 h-10"
              />
              <FieldError msg={errors["units_per_pack"]} />
            </div>

            {/* Cost helper */}
            <div className="bg-gray-50 rounded-lg p-3 space-y-3 border border-[var(--pt-border)]">
              <p className="text-xs font-semibold text-[var(--pt-text-secondary)] uppercase tracking-wide">
                Cost price
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="pack_cost" className="text-xs text-[var(--pt-text-secondary)]">
                    Pack cost (KES)
                  </Label>
                  <Input
                    id="pack_cost"
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="0.00"
                    value={packCost}
                    onChange={(e) => {
                      setPackCost(e.target.value)
                      setCostPrice("")
                    }}
                    className="mt-1 h-9 text-sm"
                  />
                </div>
                <div>
                  <Label htmlFor="cost_price" className="text-xs text-[var(--pt-text-secondary)]">
                    Per {baseUnit} (KES)
                  </Label>
                  <Input
                    id="cost_price"
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="0.00"
                    value={
                      packCost && unitsPerPack > 0
                        ? (parseFloat(packCost) / unitsPerPack).toFixed(2)
                        : costPrice
                    }
                    readOnly={!!packCost}
                    onChange={(e) => {
                      setCostPrice(e.target.value)
                      setPackCost("")
                    }}
                    className="mt-1 h-9 text-sm"
                  />
                </div>
              </div>
            </div>

            <div>
              <div className="flex justify-between items-baseline">
                <Label htmlFor="selling_price" className="text-sm font-medium">
                  Selling price per {baseUnit} (KES) *
                </Label>
                {margin !== null && (
                  <span
                    className={[
                      "text-xs font-semibold",
                      parseFloat(margin) >= 20
                        ? "text-[var(--pt-green)]"
                        : parseFloat(margin) >= 0
                          ? "text-amber-600"
                          : "text-[var(--pt-red)]",
                    ].join(" ")}
                  >
                    {margin}% margin
                  </span>
                )}
              </div>
              <Input
                id="selling_price"
                type="number"
                min={0}
                step="0.01"
                placeholder="0.00"
                value={sellingPrice}
                onChange={(e) => setSellingPrice(e.target.value)}
                className="mt-1.5 h-10"
              />
              <FieldError msg={errors["selling_price"]} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="reorder_level" className="text-sm font-medium">
                  Reorder level (in {baseUnit}s)
                </Label>
                <Input
                  id="reorder_level"
                  type="number"
                  min={0}
                  value={reorderLevel}
                  onChange={(e) => setReorderLevel(parseInt(e.target.value) || 0)}
                  className="mt-1.5 h-10"
                />
              </div>
              <div>
                <Label htmlFor="max_discount" className="text-sm font-medium">Max discount %</Label>
                <Input
                  id="max_discount"
                  type="number"
                  min={0}
                  max={100}
                  step="0.1"
                  placeholder="No limit"
                  value={maxDiscountPercent}
                  onChange={(e) => setMaxDiscountPercent(e.target.value)}
                  className="mt-1.5 h-10"
                />
                <FieldError msg={errors["max_discount_percent"]} />
              </div>
            </div>
          </div>
        )}

        {/* ── Step 4: Confirm & First Batch ── */}
        {step === 4 && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="bg-[var(--pt-green-50)] border border-[var(--pt-green-100)] rounded-lg p-4 space-y-1">
              <p className="font-semibold text-[var(--pt-text)]">
                {name}{strength ? ` ${strength}` : ""}
              </p>
              <p className="text-sm text-[var(--pt-text-secondary)]">
                {dosageForm} · {baseUnit} · KES {parseFloat(sellingPrice || "0").toFixed(2)}/{baseUnit}
              </p>
              {isControlled && (
                <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50">
                  Controlled substance
                </Badge>
              )}
            </div>

            <h3 className="text-sm font-semibold text-[var(--pt-text-secondary)] uppercase tracking-wide">
              First Batch
            </h3>

            <div>
              <Label htmlFor="batch_number" className="text-sm font-medium">Batch number *</Label>
              <Input
                id="batch_number"
                value={batchNumber}
                onChange={(e) => setBatchNumber(e.target.value)}
                placeholder="e.g. BCH2024001"
                className="mt-1.5 h-10"
                autoFocus
              />
              <FieldError msg={errors["batch_number"]} />
            </div>
            <div>
              <Label htmlFor="expiry_date" className="text-sm font-medium">Expiry date *</Label>
              <Input
                id="expiry_date"
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                min={new Date().toISOString().slice(0, 10)}
                className="mt-1.5 h-10"
              />
              <FieldError msg={errors["expiry_date"]} />
            </div>
            <div>
              <Label htmlFor="quantity_received" className="text-sm font-medium">
                Quantity received (in {baseUnit}s) *
              </Label>
              <Input
                id="quantity_received"
                type="number"
                min={1}
                value={quantityReceived}
                onChange={(e) => setQuantityReceived(parseInt(e.target.value) || 1)}
                className="mt-1.5 h-10"
              />
              {unitsPerPack > 1 && quantityReceived > 0 && (
                <p className="text-xs text-[var(--pt-text-secondary)] mt-1">
                  = {Math.floor(quantityReceived / unitsPerPack)} packs ×{" "}
                  {unitsPerPack} {baseUnit}s
                </p>
              )}
              <FieldError msg={errors["quantity_received"]} />
            </div>

            {suppliers.length > 0 && (
              <div>
                <Label className="text-sm font-medium">Supplier</Label>
                <Select value={supplierId} onValueChange={(v) => { if (v !== null) setSupplierId(v) }}>
                  <SelectTrigger className="mt-1.5 h-10">
                    <SelectValue placeholder="Select supplier…" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        )}

        {/* ── Navigation ── */}
        <div className="flex gap-2 pt-4 border-t border-[var(--pt-border)]">
          {step > 1 && (
            <Button variant="outline" onClick={back} className="flex-1">
              Back
            </Button>
          )}
          {step < 4 ? (
            <Button
              onClick={next}
              className="flex-1 bg-[var(--pt-green)] hover:bg-[var(--pt-green-600)] text-white"
            >
              Next
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={isPending}
              className="flex-1 bg-[var(--pt-green)] hover:bg-[var(--pt-green-600)] text-white font-semibold"
            >
              {isPending ? "Saving…" : "Register product"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
