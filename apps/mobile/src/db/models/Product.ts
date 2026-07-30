import { Model } from "@nozbe/watermelondb"
import { field, text } from "@nozbe/watermelondb/decorators"

export default class Product extends Model {
  static table = "products"

  @text("product_id") productId!: string
  @text("name") name!: string
  @text("brand_name") brandName!: string | null
  @text("generic_name") genericName!: string | null
  @text("strength") strength!: string | null
  @text("dosage_form") dosageForm!: string | null
  @text("base_unit") baseUnit!: string
  @text("pack_label") packLabel!: string | null
  @field("units_per_pack") unitsPerPack!: number
  @field("selling_price") sellingPrice!: number
  @field("cost_price") costPrice!: number | null
  @field("reorder_level") reorderLevel!: number
  @field("is_controlled") isControlled!: boolean
  @field("requires_prescription") requiresPrescription!: boolean
  @text("gtin") gtin!: string | null
  @text("barcode_raw") barcodeRaw!: string | null
  @text("category_id") categoryId!: string | null
  @field("is_active") isActive!: boolean
  @text("image_url") imageUrl!: string | null
  @field("max_discount_percent") maxDiscountPercent!: number | null
  @text("catalog_id") catalogId!: string | null
  @field("stock_on_hand") stockOnHand!: number
  @text("earliest_expiry") earliestExpiry!: string | null
  @field("batch_count") batchCount!: number
}
