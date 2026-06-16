import type { product_pack_size } from "@pharmatrack/db"

type PackRow = typeof product_pack_size.$inferSelect

// The new product_pack_size schema uses label/unit_count and dropped barcode +
// is_active. The UI + @pharmatrack/types ProductPackSize still use the old names,
// so map back here. barcode/is_active are synthesized (no longer persisted).
export function serializePackSize(row: PackRow) {
  return {
    id: row.id,
    product_id: row.product_id,
    pack_label: row.label,
    units_per_pack: row.unit_count,
    selling_price: Number(row.selling_price),
    barcode: null as string | null,
    is_active: true,
    created_at: "",
  }
}
