"use client"

import { useState, useRef, useCallback } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { X, Upload, Trash2, Plus, Loader2, ImageIcon, PackageOpen } from "lucide-react"
import { toast } from "sonner"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { createClient } from "@/lib/supabase/client"
import { formatKES } from "@/lib/store/cartStore"
import { CategorySelect } from "./CategorySelect"
import type { Product, ProductPackSize } from "@pharmatrack/types"

interface Props {
  productId: string | null
  onClose: () => void
  onSaved?: () => void
}

const DOSAGE_FORMS = ["Tablet","Capsule","Syrup","Cream","Gel","Injection","Drops","Inhaler","Sachet","Other"]
const BASE_UNITS   = ["tablet","capsule","ml","g","unit"]

// ─── Image uploader ──────────────────────────────────────────────────────────
function ImageUploader({ value, onChange }: { value: string | null; onChange: (url: string | null) => void }) {
  const [uploading, setUploading] = useState(false)
  const ref = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    setUploading(true)
    try {
      const supabase = createClient()
      const ext = file.name.split(".").pop() ?? "jpg"
      const path = `${crypto.randomUUID()}.${ext}`
      const { error } = await supabase.storage.from("product-images").upload(path, file)
      if (error) throw error
      const { data } = supabase.storage.from("product-images").getPublicUrl(path)
      onChange(data.publicUrl)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex items-center gap-4">
      <div className="w-20 h-20 rounded-xl border-2 border-dashed border-[var(--pt-border)] flex items-center justify-center bg-[var(--pt-muted)] shrink-0 overflow-hidden">
        {value ? (
          <img src={value} alt="Product" loading="lazy" decoding="async" className="w-full h-full object-cover" />
        ) : (
          <ImageIcon size={24} className="text-[var(--pt-text-tertiary)]" />
        )}
      </div>
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => ref.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--pt-border)] text-xs font-semibold text-[var(--pt-text-secondary)] hover:bg-[var(--pt-muted)] transition-colors disabled:opacity-50"
        >
          {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
          {uploading ? "Uploading…" : "Upload image"}
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-[var(--pt-red)] hover:bg-red-50 dark:hover:bg-red-500/15 transition-colors"
          >
            <Trash2 size={13} /> Remove
          </button>
        )}
        <p className="text-[10px] text-[var(--pt-text-tertiary)]">JPG, PNG or WebP · max 5 MB</p>
      </div>
      <input
        ref={ref}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f) }}
      />
    </div>
  )
}

// ─── Pack sizes editor ───────────────────────────────────────────────────────
function PackSizesEditor({ productId, baseUnit }: { productId: string; baseUnit: string }) {
  const queryClient = useQueryClient()
  const { data: sizes = [], isLoading } = useQuery<ProductPackSize[]>({
    queryKey: ["pack-sizes", productId],
    queryFn: async () => {
      const res = await fetch(`/api/products/${productId}/pack-sizes`)
      const json = (await res.json()) as { packSizes: ProductPackSize[] }
      return json.packSizes
    },
    staleTime: 30_000,
  })

  const [adding, setAdding] = useState(false)
  const [newForm, setNewForm] = useState({ pack_label: "", units_per_pack: "", selling_price: "", barcode: "" })
  const [saving, setSaving] = useState(false)

  async function addSize() {
    const units = parseInt(newForm.units_per_pack)
    const price = parseFloat(newForm.selling_price)
    if (!newForm.pack_label || isNaN(units) || units < 1 || isNaN(price) || price <= 0) {
      toast.error("Label, units, and price are required"); return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/products/${productId}/pack-sizes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pack_label: newForm.pack_label, units_per_pack: units, selling_price: price, barcode: newForm.barcode || null }),
      })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(json.error ?? "Failed")
      toast.success("Pack size added")
      setNewForm({ pack_label: "", units_per_pack: "", selling_price: "", barcode: "" })
      setAdding(false)
      await queryClient.invalidateQueries({ queryKey: ["pack-sizes", productId] })
    } catch (err) { toast.error(err instanceof Error ? err.message : "Error") }
    finally { setSaving(false) }
  }

  async function deleteSize(id: string) {
    try {
      const res = await fetch(`/api/products/${productId}/pack-sizes/${id}`, { method: "DELETE" })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(json.error ?? "Failed")
      toast.success("Pack size removed")
      await queryClient.invalidateQueries({ queryKey: ["pack-sizes", productId] })
    } catch (err) { toast.error(err instanceof Error ? err.message : "Error") }
  }

  async function toggleActive(size: ProductPackSize) {
    try {
      await fetch(`/api/products/${productId}/pack-sizes/${size.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !size.is_active }),
      })
      await queryClient.invalidateQueries({ queryKey: ["pack-sizes", productId] })
    } catch {}
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-[var(--pt-text-secondary)] uppercase tracking-wide">Pack Sizes</p>
        {!adding && (
          <button onClick={() => setAdding(true)} className="flex items-center gap-1 text-xs font-semibold text-[var(--pt-green-600)] hover:underline">
            <Plus size={12} /> Add size
          </button>
        )}
      </div>

      {isLoading && <div className="h-12 bg-[var(--pt-muted-strong)] rounded-lg animate-pulse" />}

      {!isLoading && sizes.length === 0 && !adding && (
        <p className="text-xs text-[var(--pt-text-tertiary)] italic">No pack sizes yet — the base {baseUnit} is the default</p>
      )}

      <div className="space-y-2">
        {sizes.map((s) => (
          <div key={s.id} className={`flex items-center justify-between px-3 py-2 rounded-lg border text-sm ${s.is_active ? "border-[var(--pt-border)] bg-[var(--pt-surface)]" : "border-dashed border-[var(--pt-border)] bg-[var(--pt-muted)] opacity-60"}`}>
            <div>
              <span className="font-semibold">{s.pack_label}</span>
              <span className="text-[var(--pt-text-tertiary)] ml-2 text-xs">{s.units_per_pack} {baseUnit}s</span>
              {s.barcode && <span className="text-[var(--pt-text-tertiary)] ml-2 font-mono text-[10px]">{s.barcode}</span>}
            </div>
            <div className="flex items-center gap-3">
              <span className="font-bold tabular-nums">{formatKES(s.selling_price)}</span>
              <button onClick={() => toggleActive(s)} className="text-[10px] font-semibold text-[var(--pt-text-tertiary)] hover:text-[var(--pt-text-secondary)]">
                {s.is_active ? "Deactivate" : "Activate"}
              </button>
              <button onClick={() => deleteSize(s.id)} className="text-[var(--pt-red)] hover:bg-red-50 dark:hover:bg-red-500/15 p-1 rounded">
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {adding && (
        <div className="border border-[var(--pt-border)] rounded-xl p-4 space-y-3 bg-[var(--pt-muted)]">
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Label (e.g. Strip of 10)" value={newForm.pack_label} onChange={(e) => setNewForm(f => ({ ...f, pack_label: e.target.value }))} className="h-9 text-sm" autoFocus />
            <Input type="number" placeholder={`${baseUnit}s per pack`} value={newForm.units_per_pack} onChange={(e) => setNewForm(f => ({ ...f, units_per_pack: e.target.value }))} className="h-9 text-sm" min={1} />
            <Input type="number" placeholder="Selling price (KES)" value={newForm.selling_price} onChange={(e) => setNewForm(f => ({ ...f, selling_price: e.target.value }))} className="h-9 text-sm" min={0} step="0.01" />
            <Input placeholder="Barcode (optional)" value={newForm.barcode} onChange={(e) => setNewForm(f => ({ ...f, barcode: e.target.value }))} className="h-9 text-sm" />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={addSize} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Save
            </Button>
            <Button size="sm" variant="outline" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Section wrapper ─────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <p className="text-[11px] font-bold text-[var(--pt-text-secondary)] uppercase tracking-wider">{title}</p>
      {children}
    </div>
  )
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-[var(--pt-text-secondary)] mb-1.5 uppercase tracking-wide">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-[var(--pt-text-tertiary)] mt-1">{hint}</p>}
    </div>
  )
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center justify-between gap-3 p-3 rounded-lg border border-[var(--pt-border)] cursor-pointer hover:bg-[var(--pt-muted)]">
      <span className="text-sm font-medium">{label}</span>
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
        className={`w-10 h-5 rounded-full transition-colors shrink-0 ${checked ? "bg-[var(--pt-green)]" : "bg-[var(--pt-border)]"}`}>
        <span className={`block w-3.5 h-3.5 rounded-full bg-[var(--pt-surface)] shadow mx-0.5 transition-transform ${checked ? "translate-x-5" : "translate-x-0"}`} />
      </button>
    </label>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────
export function EditProductSheet({ productId, onClose, onSaved }: Props) {
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery<{ product: Product }>({
    queryKey: ["product", productId],
    queryFn: async () => {
      const res = await fetch(`/api/products/${productId}`)
      if (!res.ok) throw new Error("Failed to load product")
      return res.json() as Promise<{ product: Product }>
    },
    enabled: !!productId,
    staleTime: 30_000,
  })

  const product = data?.product

  const { data: suppliersData } = useQuery<{ suppliers: Array<{ id: string; name: string }> }>({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const res = await fetch("/api/suppliers")
      if (!res.ok) return { suppliers: [] }
      return res.json() as Promise<{ suppliers: Array<{ id: string; name: string }> }>
    },
    staleTime: 5 * 60_000,
  })
  const suppliers = suppliersData?.suppliers ?? []

  // Form state — re-initialised whenever a different product loads
  const [form, setForm] = useState<Partial<Product>>({})
  const [syncedId, setSyncedId] = useState<string | null>(null)

  const setF = useCallback((key: keyof Product, value: unknown) => {
    setForm(f => ({ ...f, [key]: value }))
  }, [])

  // Sync the form when the loaded product changes (e.g. opening a different one).
  // A background refetch of the same product won't clobber in-progress edits.
  if (product && product.id !== syncedId) {
    setSyncedId(product.id)
    setForm({ ...product })
  }
  // Reset on close so reopening (even the same product) re-syncs from the DB.
  if (!productId && syncedId !== null) {
    setSyncedId(null)
  }

  const [saving, setSaving] = useState(false)

  // Derived margin display
  const cost = Number(form.cost_price ?? 0)
  const price = Number(form.selling_price ?? 0)
  const margin = cost > 0 && price > 0 ? (((price - cost) / price) * 100).toFixed(1) : null

  async function save() {
    if (!productId || !form.name || !form.selling_price) {
      toast.error("Name and selling price are required"); return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/products/${productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(json.error ?? "Failed to save")
      toast.success("Product updated")
      await queryClient.invalidateQueries({ queryKey: ["product", productId] })
      await queryClient.invalidateQueries({ queryKey: ["inventory"] })
      await queryClient.invalidateQueries({ queryKey: ["products"] })
      onSaved?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={!!productId} onOpenChange={(v) => !v && onClose()}>
      <DialogContent showCloseButton={false} className="sm:max-w-2xl w-full max-h-[90vh] p-0 flex flex-col gap-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--pt-border)] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[var(--pt-muted-strong)] flex items-center justify-center text-[var(--pt-text-secondary)]">
              <PackageOpen size={17} />
            </div>
            <div>
              <h2 className="text-base font-bold">{product?.name ?? "Edit Product"}</h2>
              {product && <p className="text-xs text-[var(--pt-text-secondary)]">{product.dosage_form} · {product.strength}</p>}
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--pt-muted-strong)] text-[var(--pt-text-secondary)]">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-7">
          {isLoading && (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-12 bg-[var(--pt-muted-strong)] rounded-xl animate-pulse" />)}
            </div>
          )}

          {product && form.name !== undefined && (
            <>
              {/* Image */}
              <Section title="Product Image">
                <ImageUploader value={form.image_url ?? null} onChange={(url) => setF("image_url", url)} />
              </Section>

              {/* Identity */}
              <Section title="Identity">
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <Field label="Generic name *">
                      <Input value={form.name ?? ""} onChange={(e) => setF("name", e.target.value)} className="h-10" />
                    </Field>
                  </div>
                  <Field label="Brand name">
                    <Input value={form.brand_name ?? ""} onChange={(e) => setF("brand_name", e.target.value || null)} className="h-10" />
                  </Field>
                  <Field label="Manufacturer">
                    <Input value={form.manufacturer ?? ""} onChange={(e) => setF("manufacturer", e.target.value || null)} className="h-10" />
                  </Field>
                  <Field label="GTIN / Barcode">
                    <Input value={form.gtin ?? ""} onChange={(e) => setF("gtin", e.target.value || null)} className="h-10 font-mono" />
                  </Field>
                  <Field label="Strength">
                    <Input value={form.strength ?? ""} onChange={(e) => setF("strength", e.target.value || null)} placeholder="500mg" className="h-10" />
                  </Field>
                </div>
                <Field label="Dosage Form">
                  <select value={form.dosage_form ?? ""} onChange={(e) => setF("dosage_form", e.target.value)}
                    className="w-full h-10 rounded-lg border border-[var(--pt-border)] px-3 text-sm bg-[var(--pt-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--pt-green)]">
                    <option value="">Select…</option>
                    {DOSAGE_FORMS.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </Field>
              </Section>

              {/* Category */}
              <Section title="Category">
                <CategorySelect value={form.category_id ?? null} onChange={(id) => setF("category_id", id)} />
              </Section>

              {/* Supplier */}
              <Section title="Supplier">
                <Field label="Default supplier" hint="Who you usually reorder this from">
                  <select value={form.supplier_id ?? ""} onChange={(e) => setF("supplier_id", e.target.value || null)}
                    className="w-full h-10 rounded-lg border border-[var(--pt-border)] px-3 text-sm bg-[var(--pt-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--pt-green)]">
                    <option value="">— None —</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </Field>
              </Section>

              {/* Units & Pricing */}
              <Section title="Units & Pricing">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Base unit">
                    <select value={form.base_unit ?? "unit"} onChange={(e) => setF("base_unit", e.target.value)}
                      className="w-full h-10 rounded-lg border border-[var(--pt-border)] px-3 text-sm bg-[var(--pt-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--pt-green)]">
                      {BASE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </Field>
                  <Field label="Pack label">
                    <Input value={form.pack_label ?? ""} onChange={(e) => setF("pack_label", e.target.value || null)} placeholder="Box, Bottle…" className="h-10" />
                  </Field>
                  <Field label={`${form.base_unit ?? "unit"}s per pack`}>
                    <Input type="number" min={1} value={form.units_per_pack ?? 1} onChange={(e) => setF("units_per_pack", parseInt(e.target.value) || 1)} className="h-10" />
                  </Field>
                  <Field label={`Cost / ${form.base_unit ?? "unit"} (KES)`}>
                    <Input type="number" min={0} step="0.01" value={form.cost_price ?? ""} onChange={(e) => setF("cost_price", e.target.value ? parseFloat(e.target.value) : null)} className="h-10" placeholder="0.00" />
                  </Field>
                  <Field label={`Sell price / ${form.base_unit ?? "unit"} (KES) *`}>
                    <Input type="number" min={0} step="0.01" value={form.selling_price ?? ""} onChange={(e) => setF("selling_price", parseFloat(e.target.value) || 0)} className="h-10" />
                  </Field>
                  <Field label="Max discount %" hint="Leave blank for no limit">
                    <Input type="number" min={0} max={100} step="1" value={form.max_discount_percent ?? ""} onChange={(e) => setF("max_discount_percent", e.target.value ? parseFloat(e.target.value) : null)} className="h-10" placeholder="e.g. 15" />
                  </Field>
                </div>
                {margin !== null && (
                  <p className={`text-xs font-semibold ${parseFloat(margin) >= 20 ? "text-[var(--pt-green)]" : parseFloat(margin) >= 0 ? "text-amber-600 dark:text-amber-400" : "text-[var(--pt-red)]"}`}>
                    Margin: {margin}%
                  </p>
                )}
                <Field label="Low-stock threshold (units)" hint="Alert when stock falls to or below this">
                  <Input type="number" min={0} value={form.reorder_level ?? 10} onChange={(e) => setF("reorder_level", parseInt(e.target.value) || 0)} className="h-10" />
                </Field>
              </Section>

              {/* Regulatory toggles */}
              <Section title="Regulatory">
                <div className="space-y-2">
                  <Toggle label="Requires prescription" checked={form.requires_prescription ?? false} onChange={(v) => setF("requires_prescription", v)} />
                  <Toggle label="Controlled substance (narcotics register)" checked={form.is_controlled ?? false} onChange={(v) => setF("is_controlled", v)} />
                  <Toggle label="Active (visible in POS & inventory)" checked={form.is_active ?? true} onChange={(v) => setF("is_active", v)} />
                </div>
              </Section>

              {/* Pack sizes */}
              <Section title="Pack Sizes">
                <PackSizesEditor productId={productId!} baseUnit={form.base_unit ?? "unit"} />
              </Section>
            </>
          )}
        </div>

        {/* Footer */}
        {product && (
          <div className="px-6 py-4 border-t border-[var(--pt-border)] shrink-0 flex gap-3">
            <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button onClick={save} disabled={saving} className="flex-1">
              {saving ? <Loader2 size={15} className="animate-spin mr-1.5" /> : null}
              Save Changes
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
