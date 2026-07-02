import type { product_pack_size } from "@pharmatrack/db"

type PackRow = typeof product_pack_size.$inferSelect

// product_pack_size uses label/unit_count internally; the UI + @pharmatrack/types
// ProductPackSize use the old pack_label/units_per_pack names — map back here.
export function serializePackSize(row: PackRow) {
  return {
    id: row.id,
    product_id: row.product_id,
    pack_label: row.label,
    units_per_pack: row.unit_count,
    selling_price: Number(row.selling_price),
    barcode: row.barcode,
    is_active: row.is_active,
    created_at: "",
  }
}
