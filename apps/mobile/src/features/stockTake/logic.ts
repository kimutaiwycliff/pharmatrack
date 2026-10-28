import { expiryMonthEnd, splitUnits, toBaseUnits } from "@pharmatrack/core"

// Stock take on Android (ADR-020) — the pure parts, mirroring the web count
// screen (apps/web/components/stockTake/CountSheet.tsx): what the server sends,
// a draft per counted batch, and turning drafts into the PUT body. The offline
// queue merges here too, so a count typed with no signal is sent once, later.

export interface Shelf {
  id: string
  name: string
  categoryId: string | null
  taxonomyKey: string | null
  products: number
  catalog: number
  lastCounted: string | null
  children: Shelf[]
}

export interface StockTakeBatch { id: string; batchNumber: string; expiry: string; qty: number | null; unitCost: number | null }
export interface StockTakeItem {
  key: string
  productId: string | null
  catalogId: string | null
  name: string
  detail: string
  group: string
  baseUnit: string
  packLabel: string | null
  unitsPerPack: number
  controlled: boolean
  needsPrice: boolean
  sellingPrice: number | null
  suggestedSell: number | null
  suggestedCost: number | null
  costPrice: number | null
  barcodes: string[]
  common: boolean
  batches: StockTakeBatch[]
}

export interface ServerLine {
  id: string; product_id: string | null; catalog_id: string | null; batch_id: string | null
  batch_number: string | null; expiry_date: string | null; barcode: string | null
  expected_qty: number | null; counted_qty: number; selling_price: number | null; cost_price: number | null
  price_confirmed: boolean
}

export interface SessionData {
  session: { id: string; kind: "count" | "setup"; title: string; status: "draft" | "review" | "posted" | "cancelled"; hide_expected: boolean }
  items: StockTakeItem[]
  lines: ServerLine[]
  can: { adjust: boolean; setup: boolean; editPrice: boolean; viewCost: boolean }
}

/** One batch being counted. Quantities are text while typing. */
export interface Draft {
  id: string; itemKey: string; productId: string | null; catalogId: string | null; batchId: string | null
  batchNumber: string; expiry: string /* YYYY-MM */; packs: string; loose: string
}
export interface Price { sell: string; costPack: string }

/** What PUT /api/stock-take/:id takes per line. */
export interface LinePayload {
  id: string; product_id: string | null; catalog_id: string | null; batch_id: string | null
  batch_number: string | null; expiry_date: string | null; barcode: string | null; counted_qty: number
  selling_price: number | null; price_confirmed: boolean; cost_price: number | null
}
export interface PendingQueue { lines: Record<string, LinePayload>; deletes: string[] }

const num = (s: string) => (s.trim() === "" ? null : Number(s))
export const itemKeyOf = (l: { product_id: string | null; catalog_id: string | null }) => (l.product_id ? `p:${l.product_id}` : `k:${l.catalog_id}`)

export function countedOf(d: Pick<Draft, "packs" | "loose">, unitsPerPack: number): number | null {
  if (d.packs.trim() === "" && d.loose.trim() === "") return null
  return toBaseUnits(Number(d.packs || 0), Number(d.loose || 0), unitsPerPack)
}

/** Server lines → drafts (+ confirmed prices and attached barcodes) when a session opens. */
export function hydrate(data: Pick<SessionData, "items" | "lines">) {
  const upp = new Map(data.items.map((i) => [i.key, i.unitsPerPack]))
  const drafts: Record<string, Draft> = {}
  const prices: Record<string, Price> = {}
  const barcodes: Record<string, string> = {}
  for (const l of data.lines) {
    const k = itemKeyOf(l)
    const u = upp.get(k) ?? 1
    const { packs, loose } = splitUnits(l.counted_qty, u)
    drafts[l.id] = {
      id: l.id, itemKey: k, productId: l.product_id, catalogId: l.catalog_id, batchId: l.batch_id,
      batchNumber: l.batch_number ?? "", expiry: l.expiry_date ? l.expiry_date.slice(0, 7) : "",
      packs: String(packs), loose: loose ? String(loose) : "",
    }
    if (l.price_confirmed && l.selling_price != null) {
      prices[k] = { sell: String(l.selling_price), costPack: l.cost_price != null ? String(Math.round(l.cost_price * u * 100) / 100) : "" }
    }
    if (l.barcode) barcodes[k] = l.barcode
  }
  return { drafts, prices, barcodes }
}

/**
 * A draft → the line to save. "delete" when the quantity was cleared; "wait"
 * when a batch found on the shelf has no expiry month yet.
 */
export function toLine(d: Draft, item: Pick<StockTakeItem, "unitsPerPack"> | undefined, price: Price | undefined, barcode: string | undefined):
  { kind: "save"; line: LinePayload } | { kind: "delete" } | { kind: "wait" } {
  const upp = Math.max(1, item?.unitsPerPack ?? 1)
  const counted = countedOf(d, upp)
  if (counted == null) return { kind: "delete" }
  const expiry = d.batchId ? null : expiryMonthEnd(d.expiry)
  if (!d.batchId && !expiry) return { kind: "wait" }
  const sell = price ? num(price.sell) : null
  const costPack = price ? num(price.costPack) : null
  return {
    kind: "save",
    line: {
      id: d.id, product_id: d.productId, catalog_id: d.productId ? null : d.catalogId, batch_id: d.batchId,
      batch_number: d.batchNumber.trim() || null, expiry_date: expiry, barcode: barcode ?? null, counted_qty: counted,
      selling_price: sell, price_confirmed: sell != null && sell > 0,
      cost_price: costPack != null ? Math.round((costPack / upp) * 100) / 100 : null,
    },
  }
}

/** Add saves/deletes to the offline queue; the newest edit of a line wins. */
export function mergeQueue(q: PendingQueue, lines: LinePayload[], deletes: string[]): PendingQueue {
  const next: PendingQueue = { lines: { ...q.lines }, deletes: [...q.deletes] }
  for (const l of lines) {
    next.lines[l.id] = l
    next.deletes = next.deletes.filter((d) => d !== l.id)
  }
  for (const d of deletes) {
    delete next.lines[d]
    if (!next.deletes.includes(d)) next.deletes.push(d)
  }
  return next
}

/** After a successful PUT of `sent`, keep only what changed since. */
export function settleQueue(current: PendingQueue, sent: PendingQueue): PendingQueue {
  const lines: Record<string, LinePayload> = {}
  for (const [id, l] of Object.entries(current.lines)) {
    if (JSON.stringify(sent.lines[id]) !== JSON.stringify(l)) lines[id] = l
  }
  return { lines, deletes: current.deletes.filter((d) => !sent.deletes.includes(d)) }
}

export const queueSize = (q: PendingQueue) => Object.keys(q.lines).length + q.deletes.length

/** "3 × Strip of 10 + 4" / "12 tablets" for a count or a recorded quantity. */
export function amountLabel(units: number, item: Pick<StockTakeItem, "unitsPerPack" | "packLabel" | "baseUnit">): string {
  const upp = Math.max(1, item.unitsPerPack)
  if (upp === 1) return `${units} ${item.baseUnit}${units === 1 ? "" : "s"}`
  const { packs, loose } = splitUnits(units, upp)
  const label = item.packLabel?.trim()
  const head = label ? `${packs} × ${label}` : `${packs} pack${packs === 1 ? "" : "s"}`
  return loose ? `${head} + ${loose}` : head
}

const DAY = 86_400_000
/** Shelves with products not counted in 90 days (or never). */
export function dueShelves(shelves: Shelf[], now: number): Shelf[] {
  return shelves.filter((s) => s.products > 0 && (!s.lastCounted || now - new Date(s.lastCounted).getTime() > 90 * DAY))
}
