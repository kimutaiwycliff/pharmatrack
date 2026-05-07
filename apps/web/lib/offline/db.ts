import Dexie, { type Table } from "dexie"
import type { ProductWithStock, CartItem } from "@pharmatrack/types"

interface OfflineSale {
  id?: number
  saleId: string
  branchId: string
  cashierId: string
  shiftId: string | null
  items: CartItem[]
  discount: number
  paymentMethod: "cash" | "mpesa" | "split"
  amountTendered: number | null
  mpesaReference: string | null
  cashAmount: number | null
  mpesaAmount: number | null
  customerPhone: string | null
  createdAt: string
  synced: boolean
}

interface CachedProduct extends ProductWithStock {
  cachedAt: number
}

class PharmaTrackDB extends Dexie {
  products!: Table<CachedProduct, string>
  offlineSales!: Table<OfflineSale, number>

  constructor() {
    super("pharmatrack-pos")
    this.version(1).stores({
      products: "product_id, gtin, barcode_raw, branch_id, cachedAt",
      offlineSales: "++id, saleId, branchId, synced, createdAt",
    })
  }
}

export const posDB = new PharmaTrackDB()

export async function cacheProduct(product: ProductWithStock) {
  await posDB.products.put({ ...product, cachedAt: Date.now() })
}

export async function getCachedProduct(
  barcode: string,
  branchId: string,
): Promise<CachedProduct | undefined> {
  const byGtin = await posDB.products.where("gtin").equals(barcode).first()
  if (byGtin?.branch_id === branchId) return byGtin

  const byRaw = await posDB.products.where("barcode_raw").equals(barcode).first()
  if (byRaw?.branch_id === branchId) return byRaw

  return undefined
}

export async function queueOfflineSale(sale: Omit<OfflineSale, "id">) {
  return posDB.offlineSales.add(sale)
}

export async function getUnsyncedSales(): Promise<OfflineSale[]> {
  return posDB.offlineSales.where("synced").equals(0).toArray()
}

export async function markSaleSynced(id: number) {
  return posDB.offlineSales.update(id, { synced: true })
}
