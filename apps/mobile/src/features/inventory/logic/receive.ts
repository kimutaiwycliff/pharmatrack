import { daysUntil } from "../../../lib/dates"
import { costPerUnit, packsToUnits, parseAmount, parsePacks } from "../../../lib/stock/units"

// Builds the POST /api/batches body from the Receive stock form — mirrors
// apps/web/components/inventory/StockReceiveForm.tsx: people enter PACKS and
// cost per PACK (what's on the supplier invoice); the server stores quantity
// and cost per BASE unit, so quantity = packs × units per pack and cost =
// pack cost ÷ units per pack rounded to the cent. Field names follow the
// route's createBatchSchema (product_id, branch_id, batch_number, expiry_date
// YYYY-MM-DD, quantity_received int > 0, cost_price ≥ 0 optional,
// supplier_id optional). The expiry must be after Nairobi-today: receiving
// already-expired stock is almost always a typo.

export interface ReceiveForm {
  productId: string | null
  branchId: string | null
  batchNumber: string
  /** YYYY-MM-DD or "" */
  expiry: string
  packsText: string
  unitsPerPack: number | null | undefined
  /** Cost per pack as typed; "" = leave cost unset. Ignored when `includeCost` is false. */
  costPerPackText: string
  includeCost: boolean
  supplierId?: string | null
}

export interface ReceiveBody {
  product_id: string
  branch_id: string
  batch_number: string
  expiry_date: string
  quantity_received: number
  cost_price?: number
  supplier_id?: string
}

export type ReceiveErrors = Partial<Record<"product" | "branch" | "batchNumber" | "expiry" | "packs" | "cost", string>>

export type ReceiveResult = { ok: true; body: ReceiveBody } | { ok: false; errors: ReceiveErrors }

export function buildReceiveBody(form: ReceiveForm, now: Date = new Date()): ReceiveResult {
  const errors: ReceiveErrors = {}
  if (!form.productId) errors.product = "Choose a product"
  if (!form.branchId) errors.branch = "No branch selected"
  const batchNumber = form.batchNumber.trim()
  if (!batchNumber) errors.batchNumber = "Enter the batch number from the pack"
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.expiry)) errors.expiry = "Choose the expiry date"
  else if (!(daysUntil(form.expiry, now) > 0)) errors.expiry = "Expiry must be in the future"
  const packs = parsePacks(form.packsText)
  if (packs == null) errors.packs = "Enter how many packs (a whole number)"
  let cost: number | undefined
  if (form.includeCost && form.costPerPackText.trim()) {
    const perPack = parseAmount(form.costPerPackText)
    if (perPack == null) errors.cost = "Enter a valid cost, e.g. 250 or 99.50"
    else cost = costPerUnit(perPack, form.unitsPerPack)
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors }

  const body: ReceiveBody = {
    product_id: form.productId!,
    branch_id: form.branchId!,
    batch_number: batchNumber,
    expiry_date: form.expiry,
    quantity_received: packsToUnits(packs!, form.unitsPerPack),
  }
  if (cost !== undefined) body.cost_price = cost
  if (form.supplierId) body.supplier_id = form.supplierId
  return { ok: true, body }
}

/** Live "= N tablets" line under the packs field (null when packs isn't valid yet). */
export function unitsPreview(packsText: string, unitsPerPack: number | null | undefined, baseUnit: string | null | undefined): string | null {
  const packs = parsePacks(packsText)
  if (packs == null) return null
  const units = packsToUnits(packs, unitsPerPack)
  const unit = baseUnit?.trim() || "unit"
  return `= ${units.toLocaleString("en-KE")} ${units === 1 ? unit : pluralize(unit)}`
}

function pluralize(word: string): string {
  if (/(s|x|ch|sh)$/i.test(word)) return `${word}es`
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`
  return `${word}s`
}
