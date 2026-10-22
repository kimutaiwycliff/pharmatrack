// API shapes for the Products screens, verified against the web routes:
//  - GET /api/products (apps/web/app/api/products/route.ts) returns raw drizzle
//    rows, so numeric(12,2) columns arrive as decimal STRINGS;
//  - GET/PATCH /api/products/[id] runs them through serialize(), so the same
//    columns arrive as NUMBERS (or null).
// `cost_price` is OMITTED entirely (not nulled) for sessions without cost.view
// (lib/auth/costVisibility.ts's omitCost) — hence optional everywhere.
// The Offline Edition's src/repo/products.ts returns these same shapes.

export interface ProductListItem {
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

export interface ProductDetail extends Omit<ProductListItem, "selling_price" | "cost_price" | "max_discount_percent"> {
  selling_price: number
  cost_price?: number | null
  max_discount_percent: number | null
}

/** apps/web/lib/products/packsize.ts's serializePackSize() — label/unit_count
 *  mapped back to pack_label/units_per_pack. */
export interface PackSize {
  id: string
  product_id: string
  pack_label: string
  units_per_pack: number
  selling_price: number
  barcode: string | null
  is_active: boolean
}

export interface ProductDetailResponse {
  product: ProductDetail
  packSizes: PackSize[]
}

export interface Category {
  id: string
  name: string
  parent_id: string | null
}

export interface Supplier {
  id: string
  name: string
}

/** GET /api/catalog item (shared drug catalogue), or a bundled KEML row offline. */
export interface CatalogItem {
  id: string
  name: string
  brand_name: string | null
  manufacturer: string | null
  gtin: string | null
  strength: string | null
  dosage_form: string | null
  base_unit: string
  is_controlled: boolean
  requires_prescription: boolean
  // Newer servers (GET /api/catalog) also send these; the Offline Edition's KEML rows don't.
  generic_name?: string | null
  pack_label?: string | null
  units_per_pack?: number | null
  reference_price?: number | null
  source?: "curated" | "ppb"
  ppb_registration_no?: string | null
  /** Default category the catalogue files it under (packages/core taxonomy). */
  category?: string | null
  subcategory?: string | null
}

/** apps/web/lib/products/permanentDelete.ts's DeleteImpact. */
export interface DeleteImpact {
  batches: number
  unitsOnHand: number
  saleLines: number
  adjustments: number
  prescriptionLines: number
  clean: boolean
}
