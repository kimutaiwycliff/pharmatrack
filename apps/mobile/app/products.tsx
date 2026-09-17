import { useEffect, useState } from "react"
import { Alert, FlatList, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native"
import { File, Directory, Paths } from "expo-file-system"
import Ionicons from "@expo/vector-icons/Ionicons"
import { toCents, formatKES } from "@pharmatrack/core"
import { apiFetch } from "../src/lib/api-fetch"
import { env } from "../src/lib/env"
import {
  listLocalProducts, getLocalProductDetail, createLocalProduct, updateLocalProduct, deleteLocalProduct,
  addLocalPackSize, updateLocalPackSize, deleteLocalPackSize, setLocalProductImage,
} from "../src/repo/products"
import { listLocalCategories, listLocalSuppliers } from "../src/repo/catalog"
import { useSessionStore } from "../src/store/session"
import { useTheme } from "../src/theme/useTheme"
import { toast } from "../src/lib/toast"
import { printLabel } from "../src/lib/labels/printLabel"
import type { Theme } from "../src/theme/tokens"
import { Button, Card, EmptyState, Screen, ScreenHeader, StatusBadge } from "../src/components"

// Mirrors apps/web/app/api/products/route.ts's GET handler exactly (verified
// against that file plus packages/db/src/schema/catalogue.ts's `product` table
// directly, not from memory): raw drizzle rows, NOT run through that route's
// sibling [id]/route.ts's serialize() helper — so numeric(12,2) columns
// (selling_price/cost_price/max_discount_percent) arrive as decimal STRINGS
// here, unlike the detail endpoint below where they're converted to numbers.
// `cost_price` is entirely OMITTED (not nulled) for roles that can't view
// cost — lib/auth/costVisibility.ts's omitCost() strips the key server-side —
// so it's optional here and only rendered/edited when actually present.
interface ProductListItem {
  id: string
  category_id: string | null
  supplier_id: string | null
  name: string
  brand_name: string | null
  generic_name: string | null
  manufacturer: string | null
  gtin: string | null
  barcode_raw: string | null
  strength: string | null
  dosage_form: string | null
  base_unit: string
  pack_label: string | null
  units_per_pack: number
  cost_price?: string | null
  selling_price: string
  reorder_level: number
  max_discount_percent: string | null
  is_controlled: boolean
  requires_prescription: boolean
  image_url: string | null
  is_active: boolean
}

interface ProductsListResponse {
  products: ProductListItem[]
  total: number
  page: number
  limit: number
}

// Mirrors apps/web/app/api/products/[id]/route.ts's GET/PATCH handlers: same
// row, but selling_price/cost_price/max_discount_percent are explicitly
// converted to numbers (or null) by that route's serialize() helper.
interface ProductDetail extends Omit<ProductListItem, "selling_price" | "cost_price" | "max_discount_percent"> {
  selling_price: number
  cost_price?: number | null
  max_discount_percent: number | null
}

// Mirrors apps/web/lib/products/packsize.ts's serializePackSize() output —
// note it maps the underlying label/unit_count columns back to the
// pack_label/units_per_pack names used everywhere else in the API.
interface PackSize {
  id: string
  product_id: string
  pack_label: string
  units_per_pack: number
  selling_price: number
  barcode: string | null
  is_active: boolean
}

interface ProductDetailResponse {
  product: ProductDetail
  packSizes: PackSize[]
}

// Loose shape for POST/PATCH /api/products responses — only `.id` is relied
// on here (the POST response in particular returns the raw insert row, not
// the serialized one, so it isn't given the full ProductDetail type).
interface ProductWriteResponse {
  product?: { id: string }
  error?: string
  existing_product_id?: string
}

// Mirrors apps/web/app/api/categories/route.ts's GET handler exactly (same
// shape used by categories.tsx) — fetched here only to power this form's
// category picker.
interface Category {
  id: string
  name: string
  parent_id: string | null
}

interface CategoriesResponse {
  categories: Category[]
}

// Mirrors apps/web/lib/suppliers/serialize.ts's output (same shape used by
// suppliers.tsx) — fetched here only to power this form's supplier picker.
interface Supplier {
  id: string
  name: string
  phone: string | null
  email: string | null
}

interface SuppliersResponse {
  suppliers: Supplier[]
}

// Mirrors apps/web/app/api/products/route.ts POST (create) and
// apps/web/app/api/products/[id]/route.ts PATCH (edit) — both open to
// pharmacists. DELETE_ROLES mirrors that same file's DELETE handler —
// pharmacist can edit a product but not hard-delete it.
const WRITE_ROLES = ["owner", "manager", "pharmacist"]
const DELETE_ROLES = ["owner", "manager"]

const PAGE_SIZE = 20

function moneyLabel(v: string | number | null | undefined): string {
  if (v == null || v === "") return "—"
  try {
    return formatKES(toCents(v))
  } catch {
    return "—"
  }
}

// A category with a non-null parent_id can't itself be a parent (server
// enforces exactly two levels — see categories.tsx), so this only ever needs
// to look up one level up.
function categoryLabel(cat: Category, all: Category[]): string {
  if (!cat.parent_id) return cat.name
  const parent = all.find((c) => c.id === cat.parent_id)
  return parent ? `${parent.name} › ${cat.name}` : cat.name
}

interface ProductFormFields {
  name: string
  brand_name: string
  generic_name: string
  manufacturer: string
  gtin: string
  barcode_raw: string
  strength: string
  dosage_form: string
  category_id: string | null
  supplier_id: string | null
  base_unit: string
  pack_label: string
  units_per_pack: string
  cost_price: string
  selling_price: string
  reorder_level: string
  max_discount_percent: string
  is_controlled: boolean
  requires_prescription: boolean
  is_active: boolean
}

const DEFAULT_FORM: ProductFormFields = {
  name: "",
  brand_name: "",
  generic_name: "",
  manufacturer: "",
  gtin: "",
  barcode_raw: "",
  strength: "",
  dosage_form: "",
  category_id: null,
  supplier_id: null,
  base_unit: "",
  pack_label: "",
  units_per_pack: "1",
  cost_price: "",
  selling_price: "",
  reorder_level: "10",
  max_discount_percent: "",
  is_controlled: false,
  requires_prescription: false,
  is_active: true,
}

export default function Products() {
  const theme = useTheme()
  const styles = createStyles(theme)
  const { role } = useSessionStore()
  // Computed before the access gate below so it can double as an effect guard
  // (hooks must run unconditionally on every render — see the gate's comment
  // further down for why the `if` can't sit above the useState/useEffect calls).
  const hasAccess = role == null || ["owner", "manager", "pharmacist"].includes(role)

  // ---- list state ----
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(1)
  const [products, setProducts] = useState<ProductListItem[]>([])
  const [total, setTotal] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  // Bumped by retry/pull-to-refresh/after a write to re-run the effect below
  // (mirrors inventory.tsx's shape, required by this repo's
  // react-hooks/set-state-in-effect rule).
  const [reloadToken, setReloadToken] = useState(0)

  // Whether this session's role can see cost_price — derived from whether the
  // key is actually present on a response object, never from a hardcoded role
  // check (the server's costVisibility.ts is the single source of truth).
  // Starts hidden (safe default) and flips true the first time a response
  // with the key present is observed (list row or product detail).
  const [costVisible, setCostVisible] = useState(false)

  // ---- picker data (categories/suppliers), loaded once ----
  const [categories, setCategories] = useState<Category[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])

  // ---- screen mode ----
  const [mode, setMode] = useState<"list" | "form">("list")
  const [formPhase, setFormPhase] = useState<"create" | "edit">("create")
  const [editingProductId, setEditingProductId] = useState<string | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [form, setForm] = useState<ProductFormFields>(DEFAULT_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [editingPackSizes, setEditingPackSizes] = useState<PackSize[]>([])
  // Offline-only: no MinIO/`/api/uploads/product-image` to upload to, so this
  // holds a device-local file:// URI instead of a server URL (see
  // handlePickImage below and repo/products.ts's setLocalProductImage).
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageSaving, setImageSaving] = useState(false)

  // ---- pack size sub-forms (edit mode only) ----
  const [newPackLabel, setNewPackLabel] = useState("")
  const [newPackUnits, setNewPackUnits] = useState("")
  const [newPackPrice, setNewPackPrice] = useState("")
  const [newPackBarcode, setNewPackBarcode] = useState("")
  const [packError, setPackError] = useState<string | null>(null)
  const [packSubmitting, setPackSubmitting] = useState(false)

  const [editingPackId, setEditingPackId] = useState<string | null>(null)
  const [editPackLabel, setEditPackLabel] = useState("")
  const [editPackUnits, setEditPackUnits] = useState("")
  const [editPackPrice, setEditPackPrice] = useState("")
  const [editPackBarcode, setEditPackBarcode] = useState("")

  useEffect(() => {
    if (!hasAccess) return
    async function load() {
      if (env.EXPO_PUBLIC_OFFLINE_MODE) {
        try {
          const trimmed = query.trim()
          const json = await listLocalProducts({ page, limit: PAGE_SIZE, q: trimmed.length >= 2 ? trimmed : undefined })
          setProducts((prev) => (page === 1 ? json.products : [...prev, ...json.products]))
          setTotal(json.total)
          setLoaded(true)
          setError(null)
          setCostVisible(true)
        } finally {
          setRefreshing(false)
          setLoadingMore(false)
        }
        return
      }
      try {
        const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) })
        const trimmed = query.trim()
        if (trimmed.length >= 2) params.set("q", trimmed)
        const res = await apiFetch(`/api/products?${params.toString()}`)
        if (!res.ok) {
          setError(`Could not load products (HTTP ${res.status})`)
          return
        }
        const json = (await res.json()) as ProductsListResponse
        setProducts((prev) => (page === 1 ? json.products : [...prev, ...json.products]))
        setTotal(json.total)
        setLoaded(true)
        setError(null)
        if (json.products.length > 0) {
          setCostVisible(Object.prototype.hasOwnProperty.call(json.products[0], "cost_price"))
        }
      } catch {
        setError("Could not reach the server. Check your connection and try again.")
      } finally {
        setRefreshing(false)
        setLoadingMore(false)
      }
    }
    load()
  }, [query, page, reloadToken, hasAccess])

  useEffect(() => {
    if (!hasAccess) return
    async function loadPickers() {
      if (env.EXPO_PUBLIC_OFFLINE_MODE) {
        setCategories(await listLocalCategories())
        setSuppliers(await listLocalSuppliers())
        return
      }
      try {
        const [catRes, supRes] = await Promise.all([apiFetch("/api/categories"), apiFetch("/api/suppliers")])
        if (catRes.ok) setCategories(((await catRes.json()) as CategoriesResponse).categories)
        if (supRes.ok) setSuppliers(((await supRes.json()) as SuppliersResponse).suppliers)
      } catch {
        // Non-fatal — pickers just render with no options; the rest of the
        // form (and the read-only list) still works.
      }
    }
    loadPickers()
  }, [hasAccess])

  // Access gate — must come after every Hook call above (rules-of-hooks:
  // Hooks can't run conditionally), but before any of the read/write logic
  // below that assumes an authorized role.
  if (role && !hasAccess) {
    return (
      <Screen>
        <ScreenHeader title="Products" />
        <EmptyState
          icon={<Ionicons name="lock-closed-outline" size={28} color={theme.textTertiary} />}
          message="You don't have access to product management."
        />
      </Screen>
    )
  }

  const canWrite = role != null && WRITE_ROLES.includes(role)
  const canDelete = role != null && DELETE_ROLES.includes(role)

  function retry() {
    setReloadToken((t) => t + 1)
  }

  function onRefresh() {
    setRefreshing(true)
    setPage(1)
    setReloadToken((t) => t + 1)
  }

  function onChangeQuery(text: string) {
    setQuery(text)
    setPage(1)
  }

  function loadMore() {
    setLoadingMore(true)
    setPage((p) => p + 1)
  }

  function setField<K extends keyof ProductFormFields>(key: K, value: ProductFormFields[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function applyDetailToForm(p: ProductDetail) {
    setForm({
      name: p.name,
      brand_name: p.brand_name ?? "",
      generic_name: p.generic_name ?? "",
      manufacturer: p.manufacturer ?? "",
      gtin: p.gtin ?? "",
      barcode_raw: p.barcode_raw ?? "",
      strength: p.strength ?? "",
      dosage_form: p.dosage_form ?? "",
      category_id: p.category_id,
      supplier_id: p.supplier_id,
      base_unit: p.base_unit,
      pack_label: p.pack_label ?? "",
      units_per_pack: String(p.units_per_pack),
      cost_price: p.cost_price != null ? String(p.cost_price) : "",
      selling_price: String(p.selling_price),
      reorder_level: String(p.reorder_level),
      max_discount_percent: p.max_discount_percent != null ? String(p.max_discount_percent) : "",
      is_controlled: p.is_controlled,
      requires_prescription: p.requires_prescription,
      is_active: p.is_active,
    })
    setImageUrl(p.image_url)
  }

  function openCreate() {
    setMode("form")
    setFormPhase("create")
    setEditingProductId(null)
    setEditingPackSizes([])
    setForm(DEFAULT_FORM)
    setFormError(null)
    setImageUrl(null)
  }

  /** Offline-only (edit mode, matching the online app's own edit-only image
   *  upload UI in EditProductSheet.tsx — not a reduced scope). Copies the
   *  picked file into permanent local storage under Paths.document (cache
   *  dir can be cleared by the OS under storage pressure) and saves the
   *  resulting file:// URI directly on the product row. */
  async function handlePickImage() {
    if (!editingProductId) return
    try {
      const pick = await File.pickFileAsync({ mimeTypes: "image/*" })
      if (pick.canceled) return
      setImageSaving(true)
      const dir = new Directory(Paths.document, "product-images")
      if (!dir.exists) dir.create({ intermediates: true })
      const ext = pick.result.extension || ".jpg"
      const dest = new File(dir, `${editingProductId}${ext}`)
      await pick.result.copy(dest, { overwrite: true })
      await setLocalProductImage(editingProductId, dest.uri)
      setImageUrl(dest.uri)
      toast.success("Photo updated")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not set photo")
    } finally {
      setImageSaving(false)
    }
  }

  async function openEdit(id: string) {
    setMode("form")
    setFormPhase("edit")
    setEditingProductId(id)
    setFormError(null)
    setDetailLoading(true)
    try {
      if (env.EXPO_PUBLIC_OFFLINE_MODE) {
        const json = await getLocalProductDetail(id)
        if (!json) {
          setFormError("Product not found")
          return
        }
        applyDetailToForm(json.product)
        setEditingPackSizes(json.packSizes)
        setCostVisible(true)
        return
      }
      const res = await apiFetch(`/api/products/${id}`)
      if (!res.ok) {
        setFormError(`Could not load product (HTTP ${res.status})`)
        return
      }
      const json = (await res.json()) as ProductDetailResponse
      applyDetailToForm(json.product)
      setEditingPackSizes(json.packSizes)
      setCostVisible(Object.prototype.hasOwnProperty.call(json.product, "cost_price"))
    } catch {
      setFormError("Could not reach the server. Check your connection and try again.")
    } finally {
      setDetailLoading(false)
    }
  }

  function backToList() {
    setMode("list")
    setEditingProductId(null)
    setEditingPackId(null)
  }

  async function handleSubmitCreate() {
    setFormError(null)
    const trimmedName = form.name.trim()
    const trimmedBaseUnit = form.base_unit.trim()
    const sellingPriceNum = parseFloat(form.selling_price)
    if (!trimmedName) {
      setFormError("Product name is required")
      return
    }
    if (!trimmedBaseUnit) {
      setFormError("Base unit is required")
      return
    }
    if (!form.selling_price.trim() || Number.isNaN(sellingPriceNum) || sellingPriceNum <= 0) {
      setFormError("Enter a valid selling price")
      return
    }

    const body: Record<string, unknown> = {
      name: trimmedName,
      base_unit: trimmedBaseUnit,
      selling_price: sellingPriceNum,
      is_controlled: form.is_controlled,
      requires_prescription: form.requires_prescription,
    }
    if (form.brand_name.trim()) body.brand_name = form.brand_name.trim()
    if (form.generic_name.trim()) body.generic_name = form.generic_name.trim()
    if (form.manufacturer.trim()) body.manufacturer = form.manufacturer.trim()
    if (form.gtin.trim()) body.gtin = form.gtin.trim()
    if (form.barcode_raw.trim()) body.barcode_raw = form.barcode_raw.trim()
    if (form.strength.trim()) body.strength = form.strength.trim()
    if (form.dosage_form.trim()) body.dosage_form = form.dosage_form.trim()
    if (form.category_id) body.category_id = form.category_id
    if (form.supplier_id) body.supplier_id = form.supplier_id
    if (form.pack_label.trim()) body.pack_label = form.pack_label.trim()
    const unitsPerPack = parseInt(form.units_per_pack, 10)
    if (!Number.isNaN(unitsPerPack) && unitsPerPack > 0) body.units_per_pack = unitsPerPack
    const reorderLevel = parseInt(form.reorder_level, 10)
    if (!Number.isNaN(reorderLevel) && reorderLevel >= 0) body.reorder_level = reorderLevel
    if (costVisible && form.cost_price.trim()) {
      const c = parseFloat(form.cost_price)
      if (!Number.isNaN(c) && c >= 0) body.cost_price = c
    }
    if (form.max_discount_percent.trim()) {
      const m = parseFloat(form.max_discount_percent)
      if (!Number.isNaN(m) && m >= 0 && m <= 100) body.max_discount_percent = m
    }

    setSubmitting(true)
    try {
      if (env.EXPO_PUBLIC_OFFLINE_MODE) {
        const created = await createLocalProduct(body as never)
        setReloadToken((t) => t + 1)
        await openEdit(created.product.id)
        return
      }
      const res = await apiFetch("/api/products", { method: "POST", body: JSON.stringify(body) })
      const respBody = (await res.json().catch(() => null)) as ProductWriteResponse | null
      if (!res.ok) {
        setFormError(respBody?.error ?? `Could not create product (HTTP ${res.status})`)
        return
      }
      setReloadToken((t) => t + 1)
      if (respBody?.product?.id) {
        await openEdit(respBody.product.id)
      } else {
        backToList()
      }
    } catch {
      setFormError("Could not reach the server. Check your connection and try again.")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSubmitEdit() {
    if (!editingProductId) return
    setFormError(null)
    const trimmedName = form.name.trim()
    const trimmedBaseUnit = form.base_unit.trim()
    const sellingPriceNum = parseFloat(form.selling_price)
    if (!trimmedName) {
      setFormError("Product name is required")
      return
    }
    if (!trimmedBaseUnit) {
      setFormError("Base unit is required")
      return
    }
    if (!form.selling_price.trim() || Number.isNaN(sellingPriceNum) || sellingPriceNum <= 0) {
      setFormError("Enter a valid selling price")
      return
    }

    const body: Record<string, unknown> = {
      name: trimmedName,
      brand_name: form.brand_name.trim() || null,
      manufacturer: form.manufacturer.trim() || null,
      gtin: form.gtin.trim() || null,
      barcode_raw: form.barcode_raw.trim() || null,
      strength: form.strength.trim() || null,
      dosage_form: form.dosage_form.trim() || null,
      category_id: form.category_id,
      supplier_id: form.supplier_id,
      base_unit: trimmedBaseUnit,
      pack_label: form.pack_label.trim() || null,
      selling_price: sellingPriceNum,
      is_controlled: form.is_controlled,
      requires_prescription: form.requires_prescription,
      is_active: form.is_active,
    }
    const unitsPerPack = parseInt(form.units_per_pack, 10)
    if (!Number.isNaN(unitsPerPack) && unitsPerPack > 0) body.units_per_pack = unitsPerPack
    const reorderLevel = parseInt(form.reorder_level, 10)
    if (!Number.isNaN(reorderLevel) && reorderLevel >= 0) body.reorder_level = reorderLevel
    if (costVisible) {
      body.cost_price = form.cost_price.trim() ? parseFloat(form.cost_price) : null
    }
    body.max_discount_percent = form.max_discount_percent.trim() ? parseFloat(form.max_discount_percent) : null

    setSubmitting(true)
    try {
      if (env.EXPO_PUBLIC_OFFLINE_MODE) {
        const result = await updateLocalProduct(editingProductId, body as never)
        if (result.product) {
          applyDetailToForm(result.product as ProductDetail)
          setCostVisible(true)
        }
        setReloadToken((t) => t + 1)
        return
      }
      const res = await apiFetch(`/api/products/${editingProductId}`, { method: "PATCH", body: JSON.stringify(body) })
      const respBody = (await res.json().catch(() => null)) as { product?: ProductDetail; error?: string } | null
      if (!res.ok) {
        setFormError(respBody?.error ?? `Could not save product (HTTP ${res.status})`)
        return
      }
      if (respBody?.product) {
        applyDetailToForm(respBody.product)
        setCostVisible(Object.prototype.hasOwnProperty.call(respBody.product, "cost_price"))
      }
      setReloadToken((t) => t + 1)
    } catch {
      setFormError("Could not reach the server. Check your connection and try again.")
    } finally {
      setSubmitting(false)
    }
  }

  function confirmDeleteProduct() {
    if (!editingProductId) return
    Alert.alert("Delete product", `Delete "${form.name}"? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: doDeleteProduct },
    ])
  }

  async function doDeleteProduct() {
    if (!editingProductId) return
    try {
      if (env.EXPO_PUBLIC_OFFLINE_MODE) {
        await deleteLocalProduct(editingProductId)
        setReloadToken((t) => t + 1)
        backToList()
        return
      }
      const res = await apiFetch(`/api/products/${editingProductId}`, { method: "DELETE" })
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) {
        Alert.alert("Could not delete", body?.error ?? `HTTP ${res.status}`)
        return
      }
      setReloadToken((t) => t + 1)
      backToList()
    } catch {
      Alert.alert("Could not reach the server", "Check your connection and try again.")
    }
  }

  async function handleAddPackSize() {
    if (!editingProductId) return
    setPackError(null)
    const trimmedLabel = newPackLabel.trim()
    const units = parseInt(newPackUnits, 10)
    const price = parseFloat(newPackPrice)
    if (!trimmedLabel) {
      setPackError("Pack label is required")
      return
    }
    if (Number.isNaN(units) || units <= 0) {
      setPackError("Enter a valid unit count")
      return
    }
    if (Number.isNaN(price) || price <= 0) {
      setPackError("Enter a valid price")
      return
    }

    setPackSubmitting(true)
    try {
      if (env.EXPO_PUBLIC_OFFLINE_MODE) {
        const result = await addLocalPackSize(editingProductId!, {
          pack_label: trimmedLabel, units_per_pack: units, selling_price: price, barcode: newPackBarcode.trim() || null,
        })
        setEditingPackSizes((prev) => [...prev, result.packSize])
        setNewPackLabel("")
        setNewPackUnits("")
        setNewPackPrice("")
        setNewPackBarcode("")
        return
      }
      const res = await apiFetch(`/api/products/${editingProductId}/pack-sizes`, {
        method: "POST",
        body: JSON.stringify({
          pack_label: trimmedLabel,
          units_per_pack: units,
          selling_price: price,
          barcode: newPackBarcode.trim() || undefined,
        }),
      })
      const body = (await res.json().catch(() => null)) as { packSize?: PackSize; error?: string } | null
      if (!res.ok) {
        setPackError(body?.error ?? `Could not add pack size (HTTP ${res.status})`)
        return
      }
      if (body?.packSize) setEditingPackSizes((prev) => [...prev, body.packSize as PackSize])
      setNewPackLabel("")
      setNewPackUnits("")
      setNewPackPrice("")
      setNewPackBarcode("")
    } catch {
      setPackError("Could not reach the server. Check your connection and try again.")
    } finally {
      setPackSubmitting(false)
    }
  }

  async function handlePrintPackLabel(ps: PackSize) {
    if (!ps.barcode) return
    try {
      await printLabel({ code: ps.barcode, productName: `${form.name} — ${ps.pack_label}`, price: ps.selling_price, copies: 1 })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not print label")
    }
  }

  function startEditPack(ps: PackSize) {
    setEditingPackId(ps.id)
    setEditPackLabel(ps.pack_label)
    setEditPackUnits(String(ps.units_per_pack))
    setEditPackPrice(String(ps.selling_price))
    setEditPackBarcode(ps.barcode ?? "")
  }

  function cancelEditPack() {
    setEditingPackId(null)
  }

  async function saveEditPack() {
    if (!editingProductId || !editingPackId) return
    const trimmedLabel = editPackLabel.trim()
    const units = parseInt(editPackUnits, 10)
    const price = parseFloat(editPackPrice)
    if (!trimmedLabel || Number.isNaN(units) || units <= 0 || Number.isNaN(price) || price <= 0) {
      Alert.alert("Invalid pack size", "Check the label, units, and price.")
      return
    }
    setPackSubmitting(true)
    try {
      if (env.EXPO_PUBLIC_OFFLINE_MODE) {
        const result = await updateLocalPackSize(editingProductId!, editingPackId, {
          pack_label: trimmedLabel, units_per_pack: units, selling_price: price, barcode: editPackBarcode.trim() || null,
        })
        setEditingPackSizes((prev) => prev.map((p) => (p.id === result.packSize.id ? result.packSize : p)))
        setEditingPackId(null)
        return
      }
      const res = await apiFetch(`/api/products/${editingProductId}/pack-sizes/${editingPackId}`, {
        method: "PATCH",
        body: JSON.stringify({
          pack_label: trimmedLabel,
          units_per_pack: units,
          selling_price: price,
          barcode: editPackBarcode.trim() || null,
        }),
      })
      const body = (await res.json().catch(() => null)) as { packSize?: PackSize; error?: string } | null
      if (!res.ok) {
        Alert.alert("Could not save", body?.error ?? `HTTP ${res.status}`)
        return
      }
      if (body?.packSize) {
        const updated = body.packSize
        setEditingPackSizes((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
      }
      setEditingPackId(null)
    } catch {
      Alert.alert("Could not reach the server", "Check your connection and try again.")
    } finally {
      setPackSubmitting(false)
    }
  }

  function confirmDeletePack(ps: PackSize) {
    Alert.alert("Delete pack size", `Delete "${ps.pack_label}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deletePack(ps.id) },
    ])
  }

  async function deletePack(id: string) {
    if (!editingProductId) return
    try {
      if (env.EXPO_PUBLIC_OFFLINE_MODE) {
        await deleteLocalPackSize(editingProductId, id)
        setEditingPackSizes((prev) => prev.filter((p) => p.id !== id))
        return
      }
      const res = await apiFetch(`/api/products/${editingProductId}/pack-sizes/${id}`, { method: "DELETE" })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        Alert.alert("Could not delete", body?.error ?? `HTTP ${res.status}`)
        return
      }
      setEditingPackSizes((prev) => prev.filter((p) => p.id !== id))
    } catch {
      Alert.alert("Could not reach the server", "Check your connection and try again.")
    }
  }

  // ---------------- form mode ----------------
  if (mode === "form") {
    return (
      <Screen>
        <ScreenHeader title={formPhase === "create" ? "New product" : "Edit product"} onBack={backToList} />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.formScrollContent} keyboardShouldPersistTaps="handled">
          {detailLoading ? (
            <Text style={styles.label}>Loading…</Text>
          ) : (
            <>
              {env.EXPO_PUBLIC_OFFLINE_MODE && formPhase === "edit" ? (
                <View style={styles.imageSection}>
                  {imageUrl ? (
                    <Image source={{ uri: imageUrl }} style={styles.imagePreview} />
                  ) : (
                    <View style={[styles.imagePreview, styles.imagePlaceholder]}>
                      <Ionicons name="image-outline" size={28} color={theme.textTertiary} />
                    </View>
                  )}
                  <Button
                    title={imageUrl ? "Change photo" : "Add photo"}
                    variant="secondary"
                    loading={imageSaving}
                    onPress={handlePickImage}
                    style={styles.imageButton}
                  />
                </View>
              ) : null}
              <TextInput
                style={styles.input}
                placeholder="Product name *"
                placeholderTextColor={theme.textTertiary}
                value={form.name}
                onChangeText={(v) => setField("name", v)}
              />
              <TextInput
                style={styles.input}
                placeholder="Brand name"
                placeholderTextColor={theme.textTertiary}
                value={form.brand_name}
                onChangeText={(v) => setField("brand_name", v)}
              />
              {formPhase === "create" ? (
                <TextInput
                  style={styles.input}
                  placeholder="Generic name (auto-filled from name if blank)"
                  placeholderTextColor={theme.textTertiary}
                  value={form.generic_name}
                  onChangeText={(v) => setField("generic_name", v)}
                />
              ) : null}
              <TextInput
                style={styles.input}
                placeholder="Manufacturer"
                placeholderTextColor={theme.textTertiary}
                value={form.manufacturer}
                onChangeText={(v) => setField("manufacturer", v)}
              />
              <View style={styles.fieldRow}>
                <TextInput
                  style={[styles.input, styles.fieldHalf]}
                  placeholder="GTIN"
                  placeholderTextColor={theme.textTertiary}
                  autoCapitalize="none"
                  value={form.gtin}
                  onChangeText={(v) => setField("gtin", v)}
                />
                <TextInput
                  style={[styles.input, styles.fieldHalf]}
                  placeholder="Raw barcode"
                  placeholderTextColor={theme.textTertiary}
                  autoCapitalize="none"
                  value={form.barcode_raw}
                  onChangeText={(v) => setField("barcode_raw", v)}
                />
              </View>
              <View style={styles.fieldRow}>
                <TextInput
                  style={[styles.input, styles.fieldHalf]}
                  placeholder="Strength (e.g. 500mg)"
                  placeholderTextColor={theme.textTertiary}
                  value={form.strength}
                  onChangeText={(v) => setField("strength", v)}
                />
                <TextInput
                  style={[styles.input, styles.fieldHalf]}
                  placeholder="Dosage form"
                  placeholderTextColor={theme.textTertiary}
                  value={form.dosage_form}
                  onChangeText={(v) => setField("dosage_form", v)}
                />
              </View>

              <Text style={styles.fieldLabel}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                <Pressable
                  onPress={() => setField("category_id", null)}
                  style={[styles.chip, form.category_id === null && styles.chipActive]}
                >
                  <Text style={[styles.chipText, form.category_id === null && styles.chipTextActive]}>None</Text>
                </Pressable>
                {categories.map((c) => (
                  <Pressable
                    key={c.id}
                    onPress={() => setField("category_id", c.id)}
                    style={[styles.chip, form.category_id === c.id && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, form.category_id === c.id && styles.chipTextActive]}>
                      {categoryLabel(c, categories)}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>

              <Text style={styles.fieldLabel}>Supplier</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                <Pressable
                  onPress={() => setField("supplier_id", null)}
                  style={[styles.chip, form.supplier_id === null && styles.chipActive]}
                >
                  <Text style={[styles.chipText, form.supplier_id === null && styles.chipTextActive]}>None</Text>
                </Pressable>
                {suppliers.map((s) => (
                  <Pressable
                    key={s.id}
                    onPress={() => setField("supplier_id", s.id)}
                    style={[styles.chip, form.supplier_id === s.id && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, form.supplier_id === s.id && styles.chipTextActive]}>{s.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>

              <TextInput
                style={styles.input}
                placeholder="Base unit * (e.g. tablet, ml, unit)"
                placeholderTextColor={theme.textTertiary}
                value={form.base_unit}
                onChangeText={(v) => setField("base_unit", v)}
              />
              <TextInput
                style={styles.input}
                placeholder="Pack label (e.g. Box of 10)"
                placeholderTextColor={theme.textTertiary}
                value={form.pack_label}
                onChangeText={(v) => setField("pack_label", v)}
              />
              <View style={styles.fieldRow}>
                <TextInput
                  style={[styles.input, styles.fieldHalf]}
                  placeholder="Units per pack"
                  placeholderTextColor={theme.textTertiary}
                  keyboardType="number-pad"
                  value={form.units_per_pack}
                  onChangeText={(v) => setField("units_per_pack", v)}
                />
                <TextInput
                  style={[styles.input, styles.fieldHalf]}
                  placeholder="Reorder level"
                  placeholderTextColor={theme.textTertiary}
                  keyboardType="number-pad"
                  value={form.reorder_level}
                  onChangeText={(v) => setField("reorder_level", v)}
                />
              </View>
              <View style={styles.fieldRow}>
                <TextInput
                  style={[styles.input, styles.fieldHalf]}
                  placeholder="Selling price (KES) *"
                  placeholderTextColor={theme.textTertiary}
                  keyboardType="decimal-pad"
                  value={form.selling_price}
                  onChangeText={(v) => setField("selling_price", v)}
                />
                {costVisible ? (
                  <TextInput
                    style={[styles.input, styles.fieldHalf]}
                    placeholder="Cost price (KES)"
                    placeholderTextColor={theme.textTertiary}
                    keyboardType="decimal-pad"
                    value={form.cost_price}
                    onChangeText={(v) => setField("cost_price", v)}
                  />
                ) : null}
              </View>
              <TextInput
                style={styles.input}
                placeholder="Max discount % (optional)"
                placeholderTextColor={theme.textTertiary}
                keyboardType="decimal-pad"
                value={form.max_discount_percent}
                onChangeText={(v) => setField("max_discount_percent", v)}
              />

              <ToggleRow
                label="Controlled substance"
                value={form.is_controlled}
                onToggle={() => setField("is_controlled", !form.is_controlled)}
                theme={theme}
                styles={styles}
              />
              <ToggleRow
                label="Requires prescription"
                value={form.requires_prescription}
                onToggle={() => setField("requires_prescription", !form.requires_prescription)}
                theme={theme}
                styles={styles}
              />
              {formPhase === "edit" ? (
                <ToggleRow
                  label="Active (uncheck to remove from active use without deleting)"
                  value={form.is_active}
                  onToggle={() => setField("is_active", !form.is_active)}
                  theme={theme}
                  styles={styles}
                />
              ) : null}

              {formError ? <Text style={styles.error}>{formError}</Text> : null}

              <Button
                title={formPhase === "create" ? "Create product" : "Save changes"}
                onPress={formPhase === "create" ? handleSubmitCreate : handleSubmitEdit}
                loading={submitting}
                style={styles.submitButton}
              />

              {formPhase === "edit" && editingProductId ? (
                <>
                  <Card style={styles.packSizesCard}>
                    <Text style={styles.sectionTitle}>Pack sizes</Text>

                    {editingPackSizes.map((ps) =>
                      editingPackId === ps.id ? (
                        <View key={ps.id} style={styles.packEditRow}>
                          <TextInput
                            style={styles.input}
                            placeholder="Label"
                            placeholderTextColor={theme.textTertiary}
                            value={editPackLabel}
                            onChangeText={setEditPackLabel}
                          />
                          <View style={styles.fieldRow}>
                            <TextInput
                              style={[styles.input, styles.fieldHalf]}
                              placeholder="Units"
                              placeholderTextColor={theme.textTertiary}
                              keyboardType="number-pad"
                              value={editPackUnits}
                              onChangeText={setEditPackUnits}
                            />
                            <TextInput
                              style={[styles.input, styles.fieldHalf]}
                              placeholder="Price (KES)"
                              placeholderTextColor={theme.textTertiary}
                              keyboardType="decimal-pad"
                              value={editPackPrice}
                              onChangeText={setEditPackPrice}
                            />
                          </View>
                          <TextInput
                            style={styles.input}
                            placeholder="Barcode (optional)"
                            placeholderTextColor={theme.textTertiary}
                            autoCapitalize="none"
                            value={editPackBarcode}
                            onChangeText={setEditPackBarcode}
                          />
                          <View style={styles.formActionsRow}>
                            <Button title="Cancel" variant="secondary" onPress={cancelEditPack} style={styles.formActionButton} />
                            <Button title="Save" onPress={saveEditPack} loading={packSubmitting} style={styles.formActionButton} />
                          </View>
                        </View>
                      ) : (
                        <View key={ps.id} style={styles.packRow}>
                          <View style={styles.packInfoCol}>
                            <Text style={styles.packLabel}>{ps.pack_label}</Text>
                            <Text style={styles.packMeta}>
                              {ps.units_per_pack} {form.base_unit || "units"} · {moneyLabel(ps.selling_price)}
                              {ps.barcode ? ` · ${ps.barcode}` : ""}
                            </Text>
                          </View>
                          <View style={styles.packActions}>
                            {ps.barcode && (
                              <Pressable onPress={() => handlePrintPackLabel(ps)} hitSlop={8} style={styles.iconButton}>
                                <Ionicons name="print-outline" size={18} color={theme.textSecondary} />
                              </Pressable>
                            )}
                            <Pressable onPress={() => startEditPack(ps)} hitSlop={8} style={styles.iconButton}>
                              <Ionicons name="pencil-outline" size={18} color={theme.textSecondary} />
                            </Pressable>
                            <Pressable onPress={() => confirmDeletePack(ps)} hitSlop={8} style={styles.iconButton}>
                              <Ionicons name="trash-outline" size={18} color={theme.red} />
                            </Pressable>
                          </View>
                        </View>
                      ),
                    )}

                    <View style={styles.packAddForm}>
                      <Text style={styles.fieldLabel}>Add a pack size</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="Label (e.g. Box of 10)"
                        placeholderTextColor={theme.textTertiary}
                        value={newPackLabel}
                        onChangeText={setNewPackLabel}
                      />
                      <View style={styles.fieldRow}>
                        <TextInput
                          style={[styles.input, styles.fieldHalf]}
                          placeholder="Units"
                          placeholderTextColor={theme.textTertiary}
                          keyboardType="number-pad"
                          value={newPackUnits}
                          onChangeText={setNewPackUnits}
                        />
                        <TextInput
                          style={[styles.input, styles.fieldHalf]}
                          placeholder="Price (KES)"
                          placeholderTextColor={theme.textTertiary}
                          keyboardType="decimal-pad"
                          value={newPackPrice}
                          onChangeText={setNewPackPrice}
                        />
                      </View>
                      <TextInput
                        style={styles.input}
                        placeholder="Barcode (optional)"
                        placeholderTextColor={theme.textTertiary}
                        autoCapitalize="none"
                        value={newPackBarcode}
                        onChangeText={setNewPackBarcode}
                      />
                      {packError ? <Text style={styles.error}>{packError}</Text> : null}
                      <Button title="Add pack size" variant="secondary" onPress={handleAddPackSize} loading={packSubmitting} />
                    </View>
                  </Card>

                  {canDelete ? (
                    <Button title="Delete product" variant="danger" onPress={confirmDeleteProduct} style={styles.deleteButton} />
                  ) : null}
                </>
              ) : null}
            </>
          )}
        </ScrollView>
      </Screen>
    )
  }

  // ---------------- list mode ----------------
  if (error && !loaded) {
    return (
      <Screen style={styles.centered}>
        <ScreenHeader title="Products" />
        <Card style={styles.errorCard}>
          <Text style={styles.error}>{error}</Text>
          <Button
            title="Retry"
            variant="secondary"
            onPress={retry}
            icon={<Ionicons name="refresh-outline" size={18} color={theme.text} />}
          />
        </Card>
      </Screen>
    )
  }

  if (!loaded) {
    return (
      <Screen style={styles.centered}>
        <ScreenHeader title="Products" />
        <Text style={styles.label}>Loading…</Text>
      </Screen>
    )
  }

  const hasMore = products.length < total

  return (
    <Screen>
      <FlatList
        data={products}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.green} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <ScreenHeader title="Products" />
            <View style={styles.titleRow}>
              <Text style={styles.subtitle}>{total} products</Text>
              {canWrite ? (
                <Button
                  title="Add"
                  onPress={openCreate}
                  icon={<Ionicons name="add" size={18} color="#fff" />}
                  style={styles.addButton}
                />
              ) : null}
            </View>

            <TextInput
              style={styles.input}
              placeholder="Search by name, brand, or barcode"
              placeholderTextColor={theme.textTertiary}
              autoCapitalize="none"
              value={query}
              onChangeText={onChangeQuery}
            />

            {error ? <Text style={styles.inlineError}>{error}</Text> : null}
          </View>
        }
        renderItem={({ item }) => (
          <ProductListRow product={item} onPress={() => openEdit(item.id)} theme={theme} styles={styles} />
        )}
        ItemSeparatorComponent={() => <View style={styles.rowGap} />}
        ListEmptyComponent={
          <EmptyState
            icon={<Ionicons name="cube-outline" size={28} color={theme.textTertiary} />}
            message="No products match your search"
          />
        }
        ListFooterComponent={
          hasMore ? (
            <Button title="Load more" variant="secondary" onPress={loadMore} loading={loadingMore} style={styles.loadMoreButton} />
          ) : null
        }
      />
    </Screen>
  )
}

function ProductListRow({
  product,
  onPress,
  theme,
  styles,
}: {
  product: ProductListItem
  onPress: () => void
  theme: Theme
  styles: Styles
}) {
  const metaParts = [product.brand_name, product.strength, product.dosage_form].filter((v): v is string => !!v)
  const hasCost = Object.prototype.hasOwnProperty.call(product, "cost_price") && product.cost_price != null

  return (
    <Pressable onPress={onPress}>
      <Card style={styles.productCard}>
        <View style={styles.productHeaderRow}>
          <View style={styles.productNameCol}>
            <Text style={styles.productName} numberOfLines={1}>
              {product.name}
            </Text>
            {metaParts.length > 0 ? (
              <Text style={styles.productMeta} numberOfLines={1}>
                {metaParts.join(" · ")}
              </Text>
            ) : null}
          </View>
          <View style={styles.priceCol}>
            <Text style={styles.priceText}>{moneyLabel(product.selling_price)}</Text>
            {hasCost ? <Text style={styles.costText}>Cost {moneyLabel(product.cost_price)}</Text> : null}
          </View>
        </View>

        <View style={styles.badgeRow}>
          {product.is_controlled ? <StatusBadge status="neutral" label="Controlled" /> : null}
          {product.requires_prescription ? <StatusBadge status="neutral" label="Rx" /> : null}
          {!product.is_active ? <StatusBadge status="danger" label="Inactive" /> : null}
        </View>
      </Card>
    </Pressable>
  )
}

function ToggleRow({
  label,
  value,
  onToggle,
  theme,
  styles,
}: {
  label: string
  value: boolean
  onToggle: () => void
  theme: Theme
  styles: Styles
}) {
  return (
    <Pressable onPress={onToggle} style={styles.toggleRow}>
      <Ionicons name={value ? "checkbox" : "square-outline"} size={22} color={value ? theme.green : theme.textTertiary} />
      <Text style={styles.toggleLabel}>{label}</Text>
    </Pressable>
  )
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    centered: { flex: 1, gap: 8 },
    label: { fontSize: 15, color: theme.text },
    error: { color: theme.red, fontSize: 13 },
    errorCard: { gap: 8 },
    inlineError: { color: theme.red, fontSize: 13 },

    listContent: { paddingBottom: 24 },
    header: { gap: 10, marginBottom: 4 },
    titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    subtitle: { fontSize: 13, color: theme.textSecondary },
    addButton: { paddingVertical: 10, paddingHorizontal: 16 },

    input: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 8,
      paddingVertical: 10,
      paddingHorizontal: 12,
      fontSize: 15,
      backgroundColor: theme.surface,
      color: theme.text,
    },

    fieldRow: { flexDirection: "row", gap: 8 },
    fieldHalf: { flex: 1 },
    fieldLabel: { fontSize: 12, fontWeight: "600", color: theme.textSecondary, marginTop: 2 },

    chipRow: { gap: 8, paddingVertical: 2 },
    chip: {
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.muted,
    },
    chipActive: { backgroundColor: theme.greenCta, borderColor: theme.greenCta },
    chipText: { fontSize: 13, fontWeight: "600", color: theme.textSecondary },
    chipTextActive: { color: "#fff" },

    toggleRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 },
    toggleLabel: { fontSize: 14, color: theme.text, flexShrink: 1 },

    rowGap: { height: 8 },
    productCard: { gap: 8 },
    productHeaderRow: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
    productNameCol: { flex: 1, gap: 2 },
    productName: { fontSize: 15, fontWeight: "600", color: theme.text },
    productMeta: { fontSize: 12, color: theme.textSecondary },
    priceCol: { alignItems: "flex-end", gap: 2 },
    priceText: { fontSize: 15, fontWeight: "700", color: theme.text },
    costText: { fontSize: 12, color: theme.textTertiary },
    badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },

    loadMoreButton: { marginTop: 12 },

    formScrollContent: { gap: 10, paddingBottom: 32 },
    submitButton: { marginTop: 8 },
    deleteButton: { marginTop: 12 },

    imageSection: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 4 },
    imagePreview: { width: 64, height: 64, borderRadius: 8, backgroundColor: theme.surface },
    imagePlaceholder: { alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.border },
    imageButton: { flex: 1 },

    sectionTitle: { fontSize: 15, fontWeight: "700", color: theme.text, marginBottom: 4 },
    packSizesCard: { gap: 10, marginTop: 12 },
    packRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8, paddingVertical: 6 },
    packInfoCol: { flex: 1, gap: 2 },
    packLabel: { fontSize: 14, fontWeight: "600", color: theme.text },
    packMeta: { fontSize: 12, color: theme.textSecondary },
    packActions: { flexDirection: "row", gap: 4 },
    packEditRow: { gap: 8, paddingVertical: 6 },
    packAddForm: { gap: 8, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: theme.border },
    iconButton: { padding: 4 },

    formActionsRow: { flexDirection: "row", gap: 8, marginTop: 4 },
    formActionButton: { flex: 1 },
  })
}

type Styles = ReturnType<typeof createStyles>
