"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { z } from "zod"
import { toast } from "sonner"
import { AlertTriangle, ArrowLeft, Camera, Check, ChevronDown, Loader2, PackageCheck, Pencil, Plus, Search, Sparkles } from "lucide-react"
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
import { CameraScanner } from "@/components/pos/CameraScanner"
import { CategoryPicker, useTenantCategories } from "./CategoryPicker"
import { buildCategoryOptions, categoryPayload, optionForSuggestion } from "@pharmatrack/core"
import { findTaxonomyEntry, suggestCategory, taxonomyKey, type CategorySuggestion } from "@pharmatrack/core"
import { SuggestInput } from "./SuggestInput"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import type { BarcodeScanEvent } from "@pharmatrack/core"
import type { ProductWithStock } from "@pharmatrack/types"
import { packPriceFromUnit, readScannedCode, unitPriceFromPack, type ScannedCode } from "@/lib/products/entry"

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
  /** Called instead of onCreated when the product already exists in this org. */
  onDuplicate?: (existingProductId: string) => void
  /** Offer "Save & add next" — stays open for entering a run of products. */
  allowAddNext?: boolean
}

const DOSAGE_FORMS = ["Tablet", "Capsule", "Syrup", "Suspension", "Cream", "Gel", "Ointment", "Lotion", "Injection", "Drops", "Inhaler", "Sachet"]
const BASE_UNITS = ["tablet", "capsule", "ml", "g", "unit", "bottle", "tube", "sachet", "pack", "vial", "inhaler", "piece"]

// Merge curated defaults with whatever this org has already used (custom values
// teammates typed in) so they're discoverable instead of silently re-typed.
function mergeSuggestions(defaults: string[], used: string[] | undefined): string[] {
  const seen = new Set(defaults.map((s) => s.toLowerCase()))
  const extra = (used ?? []).filter((s) => !seen.has(s.toLowerCase()))
  return [...defaults, ...extra]
}

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
  generic_name: string | null
  /** Typical selling price per base unit (curated rows only). */
  reference_price: number | null
  /** 'curated' retail list, or 'ppb' = the Pharmacy and Poisons Board register. */
  source: "curated" | "ppb"
  /** Default category (packages/core taxonomy) the catalogue files it under. */
  category: string | null
  subcategory: string | null
  ppb_registration_no: string | null
}

/** A product this pharmacy already has (GET /api/products). */
interface OwnProduct {
  id: string
  name: string
  strength: string | null
  dosage_form: string | null
  gtin: string | null
}

type FinderOption =
  | { kind: "own"; item: OwnProduct }
  | { kind: "catalog"; item: CatalogItem }
  | { kind: "new" }

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

function Chip({ tone = "neutral", children }: { tone?: "neutral" | "rx" | "controlled"; children: React.ReactNode }) {
  const cls = tone === "rx"
    ? "bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300"
    : tone === "controlled"
      ? "bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300"
      : "bg-[var(--pt-muted-strong)] text-[var(--pt-text-secondary)]"
  return <span className={`text-[10px] px-1.5 py-0.5 rounded ${cls}`}>{children}</span>
}

const label = (p: { name: string; strength: string | null }) => `${p.name}${p.strength ? ` ${p.strength}` : ""}`

// One box to add a product: search (or scan) → pick what it is → set price and
// stock → "Save & add next". Matches against the pharmacy's own products first
// so nothing gets entered twice, then the shared catalogue (curated list + PPB
// register), else start from scratch. Everything autofilled stays editable.
export function NewProductDialog({ open, onOpenChange, prefill, branchId, suppliers, onCreated, onDuplicate, allowAddNext }: NewProductDialogProps) {
  // Each product is a fresh <ProductEntry>; bumping the key resets it.
  const [entryKey, setEntryKey] = useState(0)
  const [added, setAdded] = useState<string[]>([])
  // Carried from one product to the next in a run.
  const [sticky, setSticky] = useState({ supplierId: "", addStock: false })
  const [scanning, setScanning] = useState(false)
  const scanTarget = useRef<((ev: BarcodeScanEvent) => void) | null>(null)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            Add product
            {added.length > 0 ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold rounded-full bg-[var(--pt-green-50)] text-[var(--pt-green-700)] px-2 py-0.5">
                <PackageCheck size={13} /> {added.length} added
              </span>
            ) : null}
          </DialogTitle>
          {added.length > 0 ? (
            <p className="text-xs text-[var(--pt-text-secondary)] truncate">Last: {added.slice(-3).reverse().join(" · ")}</p>
          ) : null}
        </DialogHeader>
        <ProductEntry
          key={entryKey}
          prefill={entryKey === 0 ? prefill : undefined}
          branchId={branchId}
          suppliers={suppliers}
          initialSupplierId={sticky.supplierId}
          initialAddStock={sticky.addStock}
          allowAddNext={!!allowAddNext}
          onCancel={() => onOpenChange(false)}
          onOpenCamera={(handler) => { scanTarget.current = handler; setScanning(true) }}
          onExisting={(id) => {
            if (onDuplicate) {
              onDuplicate(id)
              onOpenChange(false)
            } else {
              toast.info("That product is already in your catalogue — search for it instead.")
            }
          }}
          onSaved={(product, prefs, next) => {
            setSticky(prefs)
            setAdded((a) => [...a, label({ name: product.name ?? "", strength: product.strength ?? null })])
            onCreated(product)
            if (next) setEntryKey((k) => k + 1)
            else onOpenChange(false)
          }}
        />
      </DialogContent>

      {scanning && (
        <CameraScanner
          onScan={(ev) => {
            setScanning(false)
            scanTarget.current?.(ev)
          }}
          onClose={() => setScanning(false)}
        />
      )}
    </Dialog>
  )
}

interface ProductEntryProps {
  prefill?: NewProductDialogProps["prefill"]
  branchId: string
  suppliers: Array<{ id: string; name: string }>
  initialSupplierId: string
  initialAddStock: boolean
  allowAddNext: boolean
  onCancel: () => void
  onOpenCamera: (handler: (ev: BarcodeScanEvent) => void) => void
  onExisting: (productId: string) => void
  onSaved: (product: ProductWithStock, prefs: { supplierId: string; addStock: boolean }, next: boolean) => void
}

function ProductEntry({
  prefill, branchId, suppliers, initialSupplierId, initialAddStock, allowAddNext, onCancel, onOpenCamera, onExisting, onSaved,
}: ProductEntryProps) {
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isPending, startTransition] = useTransition()

  // A scan from the POS (unknown barcode) goes straight to the details.
  const [step, setStep] = useState<"find" | "details">(prefill ? "details" : "find")
  const [picked, setPicked] = useState<CatalogItem | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(true)
  const [moreOpen, setMoreOpen] = useState(false)

  // Identity
  const [name, setName] = useState(prefill?.name ?? "")
  const [brandName, setBrandName] = useState("")
  // Molecule from a catalogue pick (groups "related products"); not shown.
  const [genericName, setGenericName] = useState("")
  const [manufacturer, setManufacturer] = useState(prefill?.manufacturer ?? "")
  const [gtin, setGtin] = useState(prefill?.gtin ?? "")

  // Classification
  const [strength, setStrength] = useState("")
  const [dosageForm, setDosageForm] = useState("")
  // undefined = not chosen yet: the category follows the best suggestion
  // (catalogue or molecule) until the user picks one.
  const [categoryChoice, setCategoryChoice] = useState<string | null | undefined>(undefined)
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
  const [packPrice, setPackPrice] = useState("")
  const [reorderLevel, setReorderLevel] = useState(10)
  const [maxDiscountPercent, setMaxDiscountPercent] = useState("")

  // Opening stock (optional)
  const [addStock, setAddStock] = useState(initialAddStock || !!prefill?.batchNumber)
  const [batchNumber, setBatchNumber] = useState(prefill?.batchNumber ?? "")
  const [expiryDate, setExpiryDate] = useState(prefill?.expiryDate ? prefill.expiryDate.toISOString().slice(0, 10) : "")
  const [quantityReceived, setQuantityReceived] = useState(1)
  const [supplierId, setSupplierId] = useState(initialSupplierId)

  // Custom base units / dosage forms this org has already used, merged with
  // curated defaults for the free-text suggestion dropdowns below.
  const { data: unitsData } = useQuery<{ base_units: string[]; dosage_forms: string[] }>({
    queryKey: ["product-units"],
    queryFn: async () => {
      const res = await fetch("/api/products/units")
      if (!res.ok) return { base_units: [], dosage_forms: [] }
      return res.json() as Promise<{ base_units: string[]; dosage_forms: string[] }>
    },
    staleTime: 60_000,
  })
  const baseUnitSuggestions = mergeSuggestions(BASE_UNITS, unitsData?.base_units)
  const dosageFormSuggestions = mergeSuggestions(DOSAGE_FORMS, unitsData?.dosage_forms)

  // Category: the catalogue's own when picked from it, else a guess from the
  // name / molecule / form. "likely" guesses fill the field (marked
  // Auto-filled); "maybe" ones only show as a one-tap chip.
  const queryClient = useQueryClient()
  const { data: tenantCategories = [] } = useTenantCategories()
  const categoryOptions = useMemo(() => buildCategoryOptions(tenantCategories), [tenantCategories])
  const categorySuggestion = useMemo<CategorySuggestion | null>(() => {
    if (picked?.category && picked.subcategory && findTaxonomyEntry(taxonomyKey(picked.category, picked.subcategory))) {
      return { category: picked.category as CategorySuggestion["category"], subcategory: picked.subcategory, confidence: "likely", reason: "catalogue" }
    }
    return suggestCategory({ name: [name, brandName].filter(Boolean).join(" "), generic: genericName, dosageForm })
  }, [picked, name, brandName, genericName, dosageForm])
  const autoCategory = categorySuggestion?.confidence === "likely" ? optionForSuggestion(categoryOptions, tenantCategories, categorySuggestion) : null
  const categoryValue = categoryChoice !== undefined ? categoryChoice : autoCategory
  const categoryAutoFrom = categoryChoice === undefined && autoCategory
    ? (categorySuggestion?.reason === "catalogue" ? "from the catalogue" : `from “${categorySuggestion?.reason}”`)
    : null

  // ── Step 1: find ──────────────────────────────────────────────────────────
  const [query, setQuery] = useState("")
  const [own, setOwn] = useState<OwnProduct[]>([])
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [searching, setSearching] = useState(false)
  const [highlight, setHighlight] = useState(0)

  useEffect(() => {
    if (step !== "find") return
    const q = query.trim()
    let active = true
    const t = setTimeout(async () => {
      if (q.length < 1) { if (active) { setOwn([]); setCatalog([]) } return }
      if (active) setSearching(true)
      try {
        const [o, c] = await Promise.all([
          q.length >= 2 ? fetch(`/api/products?q=${encodeURIComponent(q)}&limit=5`).then((r) => (r.ok ? r.json() : { products: [] })) : { products: [] },
          fetch(`/api/catalog?q=${encodeURIComponent(q)}&limit=8`).then((r) => (r.ok ? r.json() : { items: [] })),
        ]) as [{ products: OwnProduct[] }, { items: CatalogItem[] }]
        if (active) { setOwn(o.products ?? []); setCatalog(c.items ?? []); setHighlight(0) }
      } catch {
        // Offline / server hiccup: "Add as new" still works.
      } finally {
        if (active) setSearching(false)
      }
    }, 200)
    return () => { active = false; clearTimeout(t) }
  }, [query, step])

  const options: FinderOption[] = [
    ...own.map((item) => ({ kind: "own" as const, item })),
    ...catalog.map((item) => ({ kind: "catalog" as const, item })),
    ...(query.trim() ? [{ kind: "new" as const }] : []),
  ]

  function applyScan(scan: ScannedCode) {
    setGtin(scan.code)
    if (scan.batchNumber) setBatchNumber(scan.batchNumber)
    if (scan.expiryDate) setExpiryDate(scan.expiryDate)
    if (scan.batchNumber || scan.expiryDate) setAddStock(true)
  }

  // A barcode: already ours → open it; in the catalogue → autofill; else start
  // a new product carrying the barcode (and any GS1 batch/expiry).
  async function lookupCode(scan: ScannedCode) {
    setSearching(true)
    try {
      const [o, c] = await Promise.all([
        fetch(`/api/products?q=${encodeURIComponent(scan.code)}&limit=5`).then((r) => (r.ok ? r.json() : { products: [] })),
        fetch(`/api/catalog?q=${encodeURIComponent(scan.code)}&limit=5`).then((r) => (r.ok ? r.json() : { items: [] })),
      ]) as [{ products: OwnProduct[] }, { items: CatalogItem[] }]
      const mine = (o.products ?? []).find((p) => p.gtin === scan.code)
      if (mine) {
        toast.info(`${label(mine)} is already in your products`)
        onExisting(mine.id)
        return
      }
      applyScan(scan)
      const hit = (c.items ?? []).find((i) => i.gtin === scan.code)
      if (hit) {
        applyCatalogItem(hit)
        return
      }
      toast.info(`New barcode ${scan.code} — fill in the product`)
      setPicked(null)
      setDetailsOpen(true)
      setStep("details")
    } catch {
      toast.error("Couldn't look that barcode up — check your connection")
    } finally {
      setSearching(false)
    }
  }

  function choose(opt: FinderOption) {
    if (opt.kind === "own") { onExisting(opt.item.id); return }
    if (opt.kind === "catalog") { applyCatalogItem(opt.item); return }
    const scan = readScannedCode(query)
    if (scan) { void lookupCode(scan); return }
    setName(query.trim())
    setPicked(null)
    setDetailsOpen(true)
    setStep("details")
  }

  function onFinderKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlight((h) => Math.min(h + 1, Math.max(options.length - 1, 0))) }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)) }
    else if (e.key === "Enter") {
      e.preventDefault()
      // A USB scanner types the code then Enter — look it up exactly.
      const scan = readScannedCode(query)
      if (scan) { void lookupCode(scan); return }
      const opt = options[highlight]
      if (opt) choose(opt)
    }
  }

  function applyCatalogItem(item: CatalogItem) {
    setName(item.name)
    setBrandName(item.brand_name ?? "")
    setGenericName(item.generic_name ?? "")
    setManufacturer(item.manufacturer ?? "")
    // Keep a scanned barcode when the catalogue row has none.
    setGtin((g) => item.gtin ?? g)
    setStrength(item.strength ?? "")
    setDosageForm(item.dosage_form ?? "")
    baseUnitTouched.current = true
    setBaseUnit(item.base_unit || "unit")
    const units = item.units_per_pack > 0 ? item.units_per_pack : 1
    if (item.pack_label) setPackLabel(item.pack_label)
    setUnitsPerPack(units)
    setIsControlled(item.is_controlled)
    setRequiresPrescription(item.requires_prescription)
    // A starting price only — the pharmacy sets its own.
    if (item.reference_price && !sellingPrice) {
      setSellingPrice(String(item.reference_price))
      setPackPrice(packPriceFromUnit(String(item.reference_price), units))
    }
    setPicked(item)
    setDetailsOpen(false)
    setStep("details")
  }

  // ── Step 2: details ───────────────────────────────────────────────────────
  const costPerUnit = packCost && unitsPerPack > 0 ? parseFloat(packCost) / unitsPerPack : parseFloat(costPrice)
  const margin = costPerUnit > 0 && parseFloat(sellingPrice) > 0
    ? (((parseFloat(sellingPrice) - costPerUnit) / parseFloat(sellingPrice)) * 100).toFixed(1)
    : null

  function onDosageChange(v: string) {
    setDosageForm(v)
    if (!baseUnitTouched.current) setBaseUnit(defaultBaseUnit(v))
  }

  function onUnitsPerPack(n: number) {
    setUnitsPerPack(n)
    setPackPrice(packPriceFromUnit(sellingPrice, n))
  }

  function handleSubmit(next: boolean) {
    const base = schema.safeParse({
      name,
      dosage_form: dosageForm,
      base_unit: baseUnit,
      selling_price: parseFloat(sellingPrice),
      max_discount_percent: maxDiscountPercent !== "" ? parseFloat(maxDiscountPercent) : null,
    })
    const errs: Record<string, string> = {}
    if (!base.success) base.error.issues.forEach((i) => { errs[i.path[0]?.toString() ?? "form"] = i.message })
    if (addStock && branchId) {
      const b = batchSchema.safeParse({ batch_number: batchNumber, expiry_date: expiryDate, quantity_received: quantityReceived })
      if (!b.success) b.error.issues.forEach((i) => { errs[i.path[0]?.toString() ?? "form"] = i.message })
    }
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      // Show whatever section holds the problem.
      if (errs["name"] || errs["dosage_form"]) setDetailsOpen(true)
      if (errs["max_discount_percent"]) setMoreOpen(true)
      return
    }
    setErrors({})

    startTransition(async () => {
      try {
        const productRes = await fetch("/api/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            brand_name: brandName || undefined,
            generic_name: genericName || undefined,
            manufacturer: manufacturer || undefined,
            gtin: gtin || undefined,
            strength: strength || undefined,
            dosage_form: dosageForm,
            ...categoryPayload(categoryValue),
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
        const productData = (await productRes.json()) as { product?: { id: string }; error?: string; existing_product_id?: string }
        if (!productRes.ok || !productData.product) {
          if (productRes.status === 409 && productData.existing_product_id) {
            toast.error(productData.error ?? "You already have this product", { duration: 6000 })
            onExisting(productData.existing_product_id)
            return
          }
          toast.error(productData.error ?? "Failed to create product")
          return
        }
        const product = productData.product
        const withStock = addStock && !!branchId

        if (withStock) {
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

        // A default category may have just been created for this pharmacy.
        if (categoryValue?.startsWith("default:")) void queryClient.invalidateQueries({ queryKey: ["categories"] })
        toast.success(`${label({ name, strength: strength || null })} added`)
        onSaved({
          ...(product as unknown as ProductWithStock),
          // products table returns `id`; the cart/sale expect `product_id`.
          product_id: product.id,
          stock_on_hand: withStock ? quantityReceived : 0,
          earliest_expiry: withStock ? expiryDate : null,
          batch_count: withStock ? 1 : 0,
        }, { supplierId, addStock }, next)
      } catch {
        toast.error("An unexpected error occurred")
      }
    })
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (step === "find") {
    return (
      <div className="space-y-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--pt-text-tertiary)] pointer-events-none" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onFinderKey}
            placeholder="Type a name or molecule, or scan the barcode"
            aria-label="Find the product to add"
            className="h-12 pl-10 pr-28 text-base"
            autoFocus
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
            {searching ? <Loader2 size={15} className="animate-spin text-[var(--pt-text-tertiary)]" /> : null}
            <button
              type="button"
              onClick={() => onOpenCamera((ev) => {
                const scan = readScannedCode(ev.raw) ?? { code: ev.gtin ?? ev.raw }
                setQuery(scan.code)
                void lookupCode(scan)
              })}
              className="h-9 px-2.5 rounded-md border border-[var(--pt-border)] text-xs font-medium inline-flex items-center gap-1 hover:bg-[var(--pt-muted)]"
            >
              <Camera size={14} /> Scan
            </button>
          </div>
        </div>

        {query.trim() === "" ? (
          <div className="rounded-lg border border-dashed border-[var(--pt-border)] p-4 text-sm text-[var(--pt-text-secondary)] space-y-1.5">
            <p className="flex items-center gap-1.5 font-medium text-[var(--pt-text-primary)]"><Sparkles size={14} className="text-[var(--pt-green-600)]" /> Start with the name or the barcode</p>
            <p>We check your products first so nothing is entered twice, then fill in the details from the drug catalogue — including the Pharmacy and Poisons Board register. You can change anything before saving.</p>
            <p className="text-xs text-[var(--pt-text-tertiary)]">Tip: ↑ ↓ to move, Enter to pick. A USB scanner works straight into this box.</p>
          </div>
        ) : (
          <div className="rounded-lg border border-[var(--pt-border)] overflow-hidden max-h-[50vh] overflow-y-auto" role="listbox" aria-label="Matches">
            {options.map((opt, i) => {
              const active = i === highlight
              const first = i === 0 || options[i - 1]!.kind !== opt.kind
              const heading = opt.kind === "own" ? "Already in your products" : opt.kind === "catalog" ? "From the catalogue" : null
              return (
                <div key={opt.kind === "new" ? "new" : `${opt.kind}:${opt.item.id}`}>
                  {first && heading ? (
                    <p className="px-3 pt-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--pt-text-secondary)] bg-[var(--pt-muted)]">{heading}</p>
                  ) : null}
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onMouseEnter={() => setHighlight(i)}
                    onClick={() => choose(opt)}
                    className={`w-full text-left px-3 py-2.5 border-b border-[var(--pt-border)] transition-colors ${active ? "bg-[var(--pt-green-50)]" : "hover:bg-[var(--pt-muted)]"}`}
                  >
                    {opt.kind === "own" ? (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium truncate">{label(opt.item)} <span className="text-[var(--pt-text-tertiary)] font-normal">{opt.item.dosage_form ?? ""}</span></span>
                        <span className="text-xs font-semibold text-[var(--pt-green-700)] shrink-0 inline-flex items-center gap-1"><Pencil size={12} /> Open</span>
                      </div>
                    ) : opt.kind === "catalog" ? (
                      <>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium truncate">{label(opt.item)}</span>
                          <span className="text-[11px] text-[var(--pt-text-tertiary)] shrink-0">{opt.item.dosage_form ?? ""}</span>
                        </div>
                        {opt.item.generic_name || opt.item.manufacturer ? (
                          <p className="text-[11px] text-[var(--pt-text-secondary)] truncate">{[opt.item.generic_name, opt.item.manufacturer].filter(Boolean).join(" · ")}</p>
                        ) : null}
                        <div className="flex flex-wrap gap-1.5 mt-0.5">
                          {opt.item.requires_prescription && <Chip tone="rx">Rx</Chip>}
                          {opt.item.is_controlled && <Chip tone="controlled">Controlled</Chip>}
                          {opt.item.reference_price ? <Chip>~KES {opt.item.reference_price} / {opt.item.base_unit}</Chip> : <Chip>per {opt.item.base_unit}</Chip>}
                          {opt.item.ppb_registration_no ? <Chip>PPB {opt.item.ppb_registration_no}</Chip> : null}
                        </div>
                      </>
                    ) : (
                      <span className="text-sm font-medium inline-flex items-center gap-1.5 text-[var(--pt-green-700)]">
                        <Plus size={14} /> {readScannedCode(query) ? `Look up barcode ${query.trim()}` : `Add “${query.trim()}” as a new product`}
                      </span>
                    )}
                  </button>
                </div>
              )
            })}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button variant="outline" onClick={onCancel} className="flex-1">Close</Button>
          <Button variant="outline" onClick={() => { setPicked(null); setDetailsOpen(true); setStep("details") }} className="flex-1">
            Fill in manually
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div
      className="space-y-6"
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSubmit(allowAddNext) }
      }}
    >
      <button type="button" onClick={() => setStep("find")} className="inline-flex items-center gap-1 text-xs font-medium text-[var(--pt-text-secondary)] hover:text-[var(--pt-text-primary)]">
        <ArrowLeft size={13} /> Search again
      </button>

      {/* What it is: a summary when it came from the catalogue, the fields otherwise */}
      {picked && !detailsOpen ? (
        <div className="rounded-lg border border-[var(--pt-green-100)] bg-[var(--pt-green-50)] p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm font-semibold"><Check size={14} className="text-[var(--pt-green-600)] shrink-0" /> <span className="truncate">{label({ name, strength: strength || null })}</span></p>
              <p className="text-xs text-[var(--pt-text-secondary)] mt-0.5 truncate">
                {[dosageForm, genericName, manufacturer].filter(Boolean).join(" · ")}
              </p>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {requiresPrescription && <Chip tone="rx">Rx</Chip>}
                {isControlled && <Chip tone="controlled">Controlled</Chip>}
                <Chip>per {baseUnit}</Chip>
                {gtin ? <Chip>Barcode {gtin}</Chip> : null}
                {picked.ppb_registration_no ? <Chip>PPB {picked.ppb_registration_no}</Chip> : null}
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => setDetailsOpen(true)} className="shrink-0">
              <Pencil size={13} className="mr-1" /> Edit details
            </Button>
          </div>
          {picked.source === "ppb" ? (
            <p className="text-[11px] text-[var(--pt-text-tertiary)] mt-2">From the Pharmacy and Poisons Board register — check the strength and flags match your stock.</p>
          ) : null}
        </div>
      ) : (
        <>
          {/* Identity */}
          <div className="space-y-4">
            <SectionTitle>Identity</SectionTitle>
            <div>
              <Label htmlFor="name" className="text-sm font-medium">Generic name *</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Amoxicillin" className="mt-1.5 h-10" autoFocus={!picked} />
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
                <SuggestInput
                  value={dosageForm}
                  onChange={onDosageChange}
                  suggestions={dosageFormSuggestions}
                  placeholder="e.g. Tablet, or type your own…"
                  className="mt-1.5 h-10"
                />
                <FieldError msg={errors["dosage_form"]} />
              </div>
            </div>
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
        </>
      )}

      {/* Category — one pick sets category + subcategory */}
      <div className="space-y-2">
        <SectionTitle>Category</SectionTitle>
        <CategoryPicker
          value={categoryValue}
          onChange={setCategoryChoice}
          suggestion={categorySuggestion}
          autoFilledFrom={categoryAutoFrom}
        />
      </div>

      {/* Units & Price */}
      <div className="space-y-4">
        <SectionTitle>Units & Price</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label className="text-sm font-medium">Sold per *</Label>
            <SuggestInput
              value={baseUnit}
              onChange={(v) => { baseUnitTouched.current = true; setBaseUnit(v) }}
              suggestions={baseUnitSuggestions}
              placeholder="tablet…"
              className="mt-1.5 h-10"
            />
          </div>
          <div>
            <Label htmlFor="pack_label" className="text-sm font-medium">Pack</Label>
            <Input id="pack_label" value={packLabel} onChange={(e) => setPackLabel(e.target.value)} placeholder="Box, Strip…" className="mt-1.5 h-10" />
          </div>
          <div>
            <Label htmlFor="units_per_pack" className="text-sm font-medium">{baseUnit}s per pack</Label>
            <Input id="units_per_pack" type="number" min={1} value={unitsPerPack} onChange={(e) => onUnitsPerPack(parseInt(e.target.value) || 1)} className="mt-1.5 h-10" />
          </div>
        </div>

        <div>
          <div className="flex justify-between items-baseline">
            <Label htmlFor="selling_price" className="text-sm font-medium">Selling price (KES) *</Label>
            {margin !== null && (
              <span className={`text-xs font-semibold ${parseFloat(margin) >= 20 ? "text-[var(--pt-green)]" : parseFloat(margin) >= 0 ? "text-amber-600 dark:text-amber-400" : "text-[var(--pt-red)]"}`}>{margin}% margin</span>
            )}
          </div>
          <div className={`grid gap-3 mt-1.5 ${unitsPerPack > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
            {unitsPerPack > 1 ? (
              <div>
                <Input id="pack_price" type="number" min={0} step="0.01" placeholder="0.00" aria-label="Selling price per pack" value={packPrice}
                  onChange={(e) => { setPackPrice(e.target.value); setSellingPrice(unitPriceFromPack(e.target.value, unitsPerPack)) }} className="h-10" />
                <p className="text-[11px] text-[var(--pt-text-tertiary)] mt-1">per {packLabel || "pack"} of {unitsPerPack}</p>
              </div>
            ) : null}
            <div>
              <Input id="selling_price" type="number" min={0} step="0.01" placeholder="0.00" aria-label={`Selling price per ${baseUnit}`} value={sellingPrice}
                onChange={(e) => { setSellingPrice(e.target.value); setPackPrice(packPriceFromUnit(e.target.value, unitsPerPack)) }} className="h-10" />
              <p className="text-[11px] text-[var(--pt-text-tertiary)] mt-1">per {baseUnit}{picked?.reference_price ? " · suggested from the catalogue — change it to yours" : ""}</p>
            </div>
          </div>
          <FieldError msg={errors["selling_price"]} />
        </div>

        <div className="bg-[var(--pt-muted)] rounded-lg p-3 space-y-3 border border-[var(--pt-border)]">
          <p className="text-xs font-semibold text-[var(--pt-text-secondary)] uppercase tracking-wide">Cost price (optional)</p>
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
      </div>

      {/* Opening stock (optional) */}
      <div className="space-y-4">
        <SectionTitle>Opening Stock</SectionTitle>
        {branchId ? (
          <>
            <Toggle label="Receive opening stock now" description="Otherwise add a batch later from Inventory → Receive" checked={addStock} onChange={setAddStock} />
            {addStock && (
              <div className="space-y-4 border-l-2 border-[var(--pt-green-100)] pl-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <Label htmlFor="quantity_received" className="text-sm font-medium">Quantity ({baseUnit}s) *</Label>
                    <Input id="quantity_received" type="number" min={1} value={quantityReceived} onChange={(e) => setQuantityReceived(parseInt(e.target.value) || 1)} className="mt-1.5 h-10" />
                    <FieldError msg={errors["quantity_received"]} />
                  </div>
                  <div>
                    <Label htmlFor="batch_number" className="text-sm font-medium">Batch no. *</Label>
                    <Input id="batch_number" value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} placeholder="BCH2024001" className="mt-1.5 h-10" />
                    <FieldError msg={errors["batch_number"]} />
                  </div>
                  <div>
                    <Label htmlFor="expiry_date" className="text-sm font-medium">Expiry *</Label>
                    <Input id="expiry_date" type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} min={new Date().toISOString().slice(0, 10)} className="mt-1.5 h-10" />
                    <FieldError msg={errors["expiry_date"]} />
                  </div>
                </div>
                {unitsPerPack > 1 && quantityReceived > 0 && (
                  <p className="text-xs text-[var(--pt-text-secondary)] -mt-2">= {Math.floor(quantityReceived / unitsPerPack)} × {packLabel || "pack"} of {unitsPerPack}{quantityReceived % unitsPerPack ? ` + ${quantityReceived % unitsPerPack} ${baseUnit}s` : ""}</p>
                )}
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-[var(--pt-text-tertiary)] italic">Choose a branch at the top of the page to receive stock here, or add it later from Inventory → Receive.</p>
        )}
      </div>

      {/* More options */}
      <div>
        <button type="button" onClick={() => setMoreOpen((v) => !v)} className="inline-flex flex-wrap items-center gap-1 text-sm font-medium text-[var(--pt-text-secondary)] hover:text-[var(--pt-text-primary)]">
          <ChevronDown size={15} className={`transition-transform ${moreOpen ? "rotate-180" : ""}`} /> More options
          <span className="text-xs text-[var(--pt-text-tertiary)] font-normal">— supplier, reorder level, discount limit</span>
        </button>
        {moreOpen && (
          <div className="space-y-4 mt-3">
            {suppliers.length > 0 && (
              <div>
                <Label className="text-sm font-medium">Default supplier</Label>
                <Select value={supplierId} onValueChange={(v) => { if (v !== null) setSupplierId(v) }}>
                  <SelectTrigger className="mt-1.5 h-10"><SelectValue placeholder="Select supplier…" /></SelectTrigger>
                  <SelectContent>{suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
                <p className="text-xs text-[var(--pt-text-tertiary)] mt-1">Who you usually order this from. Also used for any opening stock, and kept for the next product.</p>
              </div>
            )}
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
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 pt-4 border-t border-[var(--pt-border)]">
        <Button variant="outline" onClick={onCancel} className="flex-1 min-w-[96px]">Cancel</Button>
        {allowAddNext ? (
          <>
            <Button variant="outline" onClick={() => handleSubmit(false)} disabled={isPending} className="flex-1 min-w-[96px]">
              Save & close
            </Button>
            <Button onClick={() => handleSubmit(true)} disabled={isPending} title="Ctrl + Enter" className="flex-[2] min-w-[160px] bg-[var(--pt-green)] hover:bg-[var(--pt-green-600)] text-white font-semibold">
              {isPending ? "Saving…" : "Save & add next"}
            </Button>
          </>
        ) : (
          <Button onClick={() => handleSubmit(false)} disabled={isPending} className="flex-1 bg-[var(--pt-green)] hover:bg-[var(--pt-green-600)] text-white font-semibold">
            {isPending ? "Saving…" : addStock && branchId ? "Add product & stock" : "Add product"}
          </Button>
        )}
      </div>
    </div>
  )
}
