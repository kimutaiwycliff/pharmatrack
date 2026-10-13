import { Directory, File, Paths } from "expo-file-system"
import * as Crypto from "expo-crypto"
import { apiJson, ApiError, NETWORK_ERROR, withQuery } from "../../lib/api"
import { apiFetchFormData } from "../../lib/api-fetch"
import { env } from "../../lib/env"
import {
  addLocalPackSize, createLocalProduct, deleteLocalPackSize, deleteLocalProduct, getLocalProductDetail, listLocalProducts,
  setLocalProductImage, updateLocalPackSize, updateLocalProduct,
} from "../../repo/products"
import { listLocalCategories, listLocalSuppliers } from "../../repo/catalog"
import { KEML_CATALOG } from "../../data/keml-catalog"
import type { Page } from "../../hooks/useQuery"
import type { ProductBody } from "./logic/form"
import type { PackSizeBody } from "./logic/units"
import { searchCatalogRows } from "./logic/list"
import type { CatalogItem, Category, DeleteImpact, PackSize, ProductDetail, ProductDetailResponse, ProductListItem, Supplier } from "./types"
import { UserFacingError } from "../../lib/errors"

// Every read/write the Products screens make, in one place, with the Offline
// Edition (ADR-014, env.EXPO_PUBLIC_OFFLINE_MODE) routed to src/repo/* and the
// online app to the web API. Screens never call apiJson or the repos directly,
// so the "never call the API in the Offline Edition" rule holds by construction.

const LOCAL = env.EXPO_PUBLIC_OFFLINE_MODE
export const PAGE_SIZE = 30

export async function listProducts(page: number, q: string | undefined): Promise<Page<ProductListItem>> {
  if (LOCAL) {
    const r = await listLocalProducts({ page, limit: PAGE_SIZE, q })
    return { items: r.products, total: r.total }
  }
  const r = await apiJson<{ products: ProductListItem[]; total: number }>(withQuery("/api/products", { page, limit: PAGE_SIZE, q }))
  return { items: r.products, total: r.total }
}

export async function getProduct(id: string): Promise<ProductDetailResponse> {
  if (LOCAL) {
    const r = await getLocalProductDetail(id)
    if (!r) throw new ApiError(404, "Product not found")
    return r
  }
  return apiJson<ProductDetailResponse>(`/api/products/${id}`)
}

/** Creates a product; resolves with its id. A duplicate (409) throws ApiError whose body has existing_product_id. */
export async function createProduct(body: ProductBody): Promise<string> {
  if (LOCAL) {
    const { image_url, ...rest } = body
    const created = await createLocalProduct(rest)
    if (image_url) await setLocalProductImage(created.product.id, image_url)
    return created.product.id
  }
  const r = await apiJson<{ product: { id: string } }>("/api/products", { method: "POST", body })
  return r.product.id
}

export async function updateProduct(id: string, body: ProductBody): Promise<ProductDetail | undefined> {
  if (LOCAL) {
    const { image_url, ...rest } = body
    await setLocalProductImage(id, image_url ?? null)
    const r = await updateLocalProduct(id, rest)
    return r.product as ProductDetail | undefined
  }
  const r = await apiJson<{ product: ProductDetail }>(`/api/products/${id}`, { method: "PATCH", body })
  return r.product
}

/** Deactivate / reactivate. The local repo writes every column, so it gets the full row back. */
export async function setProductActive(p: ProductDetail, isActive: boolean): Promise<void> {
  if (LOCAL) {
    await updateLocalProduct(p.id, {
      name: p.name, brand_name: p.brand_name, generic_name: p.generic_name, manufacturer: p.manufacturer, gtin: p.gtin,
      barcode_raw: p.barcode_raw, strength: p.strength, dosage_form: p.dosage_form, category_id: p.category_id,
      supplier_id: p.supplier_id, base_unit: p.base_unit, pack_label: p.pack_label, units_per_pack: p.units_per_pack,
      selling_price: p.selling_price, cost_price: p.cost_price ?? null, reorder_level: p.reorder_level,
      max_discount_percent: p.max_discount_percent, is_controlled: p.is_controlled, requires_prescription: p.requires_prescription,
      is_active: isActive,
    })
    return
  }
  await apiJson(`/api/products/${p.id}`, { method: "PATCH", body: { is_active: isActive } })
}

export interface DeleteImpactResponse {
  impact: DeleteImpact
  canDeletePermanently: boolean
}

/** Online only — the Offline Edition has no impact query (see DeleteProductSheet). */
export function getDeleteImpact(id: string): Promise<DeleteImpactResponse> {
  return apiJson<DeleteImpactResponse>(`/api/products/${id}/delete-impact`)
}

export async function deleteProduct(id: string, permanent?: { confirmName: string }): Promise<void> {
  if (LOCAL) {
    await deleteLocalProduct(id)
    return
  }
  if (permanent) {
    await apiJson(`/api/products/${id}?permanent=1`, { method: "DELETE", body: { confirm_name: permanent.confirmName } })
  } else {
    await apiJson(`/api/products/${id}`, { method: "DELETE" })
  }
}

// ── Pack sizes ───────────────────────────────────────────────────────────────

export async function addPackSize(productId: string, body: PackSizeBody): Promise<PackSize> {
  if (LOCAL) return (await addLocalPackSize(productId, body)).packSize
  const r = await apiJson<{ packSize: PackSize }>(`/api/products/${productId}/pack-sizes`, { method: "POST", body })
  return r.packSize
}

export async function updatePackSize(productId: string, packId: string, body: PackSizeBody): Promise<PackSize> {
  if (LOCAL) return (await updateLocalPackSize(productId, packId, body)).packSize
  const r = await apiJson<{ packSize: PackSize }>(`/api/products/${productId}/pack-sizes/${packId}`, { method: "PATCH", body })
  return r.packSize
}

/** Online only: the local pack-size table has no per-row active toggle in its repo. */
export async function setPackSizeActive(productId: string, packId: string, isActive: boolean): Promise<PackSize> {
  const r = await apiJson<{ packSize: PackSize }>(`/api/products/${productId}/pack-sizes/${packId}`, { method: "PATCH", body: { is_active: isActive } })
  return r.packSize
}

export async function deletePackSize(productId: string, packId: string): Promise<void> {
  if (LOCAL) {
    await deleteLocalPackSize(productId, packId)
    return
  }
  await apiJson(`/api/products/${productId}/pack-sizes/${packId}`, { method: "DELETE" })
}

/** "Sell in smaller units" — online only (POST /split-unit converts batches and history server-side). */
export function splitUnit(productId: string, body: { new_base_unit: string; factor: number }): Promise<{ ok: true; base_unit: string; selling_price: number }> {
  return apiJson(`/api/products/${productId}/split-unit`, { method: "POST", body })
}

// ── Pickers + suggestions ────────────────────────────────────────────────────

export async function listCategories(): Promise<Category[]> {
  if (LOCAL) return listLocalCategories()
  return (await apiJson<{ categories: Category[] }>("/api/categories")).categories
}

export async function listSuppliers(): Promise<Supplier[]> {
  if (LOCAL) return listLocalSuppliers()
  return (await apiJson<{ suppliers: Supplier[] }>("/api/suppliers")).suppliers
}

/** Base units / dosage forms this org already uses (GET /api/products/units). */
export async function listUsedUnits(): Promise<{ base_units: string[]; dosage_forms: string[] }> {
  if (LOCAL) return { base_units: [], dosage_forms: [] }
  return apiJson("/api/products/units")
}

/** Shared drug catalogue search; the Offline Edition searches its bundled KEML rows. */
export async function searchCatalog(q: string): Promise<CatalogItem[]> {
  if (LOCAL) {
    return searchCatalogRows(KEML_CATALOG, q).map((r) => ({
      id: r.id, name: r.name, brand_name: null, manufacturer: null, gtin: null, strength: r.strength,
      dosage_form: r.dosageForm, base_unit: r.baseUnit, is_controlled: r.isControlled, requires_prescription: r.requiresPrescription,
    }))
  }
  return (await apiJson<{ items: CatalogItem[] }>(withQuery("/api/catalog", { q, limit: 8 }))).items
}

// ── Product image ────────────────────────────────────────────────────────────

/**
 * Lets the user pick a photo and returns the value to store in image_url, or
 * null if they cancelled. Online: uploaded to POST /api/uploads/product-image
 * (multipart; same 5 MB / JPG-PNG-WebP limits as web's ImageUploader) and the
 * returned app URL is saved with the product. Offline Edition: copied under
 * Paths.document (the cache dir can be cleared by the OS) and the file:// URI
 * is saved instead — there is no server to upload to.
 */
export async function pickProductImage(): Promise<string | null> {
  const pick = await File.pickFileAsync({ mimeTypes: "image/*" })
  if (pick.canceled) return null
  const file = pick.result
  if (LOCAL) {
    const dir = new Directory(Paths.document, "product-images")
    if (!dir.exists) dir.create({ intermediates: true })
    const dest = new File(dir, `${Crypto.randomUUID()}${file.extension || ".jpg"}`)
    await file.copy(dest, { overwrite: true })
    return dest.uri
  }
  if (file.size > 5 * 1024 * 1024) throw new UserFacingError("Image must be 5 MB or smaller")
  const type = file.type || "image/jpeg"
  const fd = new FormData()
  // React Native's FormData takes a { uri, name, type } descriptor for files.
  fd.append("file", { uri: file.uri, name: file.name || `photo${file.extension || ".jpg"}`, type } as unknown as Blob)
  let res: Response
  try {
    res = await apiFetchFormData("/api/uploads/product-image", fd)
  } catch {
    throw new ApiError(0, NETWORK_ERROR)
  }
  const json = (await res.json().catch(() => ({}))) as { publicUrl?: string; error?: string }
  if (!res.ok || !json.publicUrl) throw new ApiError(res.status, json.error ?? "Upload failed")
  return json.publicUrl
}
