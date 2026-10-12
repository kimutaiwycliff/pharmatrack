import { scanMatchesProduct, type ScanFields } from "../../../lib/stock/scan-fields"
import { costPerUnit, packsToUnits, parseAmount, parsePacks } from "../../../lib/stock/units"
import type { PoItem } from "./types"

// Receive-delivery form state → POST /api/purchase-orders/[id]/receive.
// Mirrors apps/web/components/purchasing/ReceiveDeliveryPanel.tsx: every line
// starts with the outstanding packs and the PO's expected cost per pack; staff
// fill batch number + expiry (or scan the GS1 code), split a line into extra
// batches, and untick anything that didn't come. The payload matches the
// route's Zod schema exactly:
//   { lines: [{ item_id, batches: [{ batch_number, expiry_date, quantity (packs), unit_cost? (per pack) }] }], close? }
// Pure (no React Native) so it is unit-tested in __tests__/receive.test.ts.

export interface BatchDraft {
  /** Stable React key. */
  key: string
  batchNumber: string
  /** YYYY-MM-DD or "" */
  expiry: string
  /** Packs as typed. */
  packs: string
  /** Cost per pack as typed ("" = use the PO's expected cost). */
  unitCost: string
}

export interface LineDraft {
  included: boolean
  batches: BatchDraft[]
}

export interface ReceiveForm {
  /** Keyed by PO item id. */
  lines: Record<string, LineDraft>
  /** "Close the order even if some items came short". */
  close: boolean
  /** Counter for batch keys. */
  seq: number
}

export interface ReceiveBatchPayload {
  batch_number: string
  expiry_date: string
  quantity: number
  unit_cost?: number
}

export interface ReceivePayload {
  lines: { item_id: string; batches: ReceiveBatchPayload[] }[]
  close: boolean
}

export interface BatchErrors {
  batchNumber?: string
  expiry?: string
  packs?: string
  unitCost?: string
}

export interface ReceiveSummary {
  /** Lines being received. */
  lines: number
  batches: number
  packs: number
  /** Packs converted to base units (what lands in stock). */
  units: number
  /** Invoice value in integer cents (entered cost, else the PO's), null when cost is hidden. */
  invoiceCents: number | null
}

export interface ReceiveResult {
  /** null while anything is invalid. */
  payload: ReceivePayload | null
  /** Per batch key. */
  errors: Record<string, BatchErrors>
  /** Per item id (e.g. too many batches). */
  lineErrors: Record<string, string>
  /** Readable list, first one toasts on submit. */
  problems: string[]
  summary: ReceiveSummary
}

// Server limits (receive route's Zod schema).
export const MAX_BATCHES_PER_LINE = 20
export const MAX_PACKS = 1_000_000
export const MAX_BATCH_NUMBER = 80

/** Lines whose product still exists — deleted products can't be received (server 409). */
export function receivableItems(items: PoItem[]): PoItem[] {
  return items.filter((i) => !!i.product_id)
}

export function outstandingPacks(i: Pick<PoItem, "quantity_ordered" | "quantity_received">): number {
  return Math.max(0, i.quantity_ordered - i.quantity_received)
}

const costText = (cost: number | null) => (cost == null ? "" : String(Math.round(cost * 100) / 100))

export function initReceiveForm(items: PoItem[]): ReceiveForm {
  let seq = 0
  const lines: Record<string, LineDraft> = {}
  for (const i of receivableItems(items)) {
    const out = outstandingPacks(i)
    lines[i.id] = {
      included: out > 0,
      batches: [{ key: `b${seq++}`, batchNumber: "", expiry: "", packs: String(Math.max(1, out)), unitCost: costText(i.unit_cost) }],
    }
  }
  return { lines, close: false, seq }
}

// ── Form updates (immutable) ─────────────────────────────────────────────────

function withLine(form: ReceiveForm, itemId: string, fn: (l: LineDraft) => LineDraft): ReceiveForm {
  const line = form.lines[itemId]
  if (!line) return form
  return { ...form, lines: { ...form.lines, [itemId]: fn(line) } }
}

export function setIncluded(form: ReceiveForm, itemId: string, included: boolean): ReceiveForm {
  return withLine(form, itemId, (l) => ({ ...l, included }))
}

export function updateBatch(form: ReceiveForm, itemId: string, key: string, patch: Partial<Omit<BatchDraft, "key">>): ReceiveForm {
  return withLine(form, itemId, (l) => ({ ...l, batches: l.batches.map((b) => (b.key === key ? { ...b, ...patch } : b)) }))
}

/** "Add another batch": one pack, same cost as the line's first batch. */
export function addBatch(form: ReceiveForm, itemId: string): ReceiveForm {
  const line = form.lines[itemId]
  if (!line || line.batches.length >= MAX_BATCHES_PER_LINE) return form
  const key = `b${form.seq}`
  return {
    ...withLine(form, itemId, (l) => ({
      ...l,
      batches: [...l.batches, { key, batchNumber: "", expiry: "", packs: "1", unitCost: l.batches[0]?.unitCost ?? "" }],
    })),
    seq: form.seq + 1,
  }
}

/** Remove a batch row (a line always keeps at least one). */
export function removeBatch(form: ReceiveForm, itemId: string, key: string): ReceiveForm {
  return withLine(form, itemId, (l) => (l.batches.length <= 1 ? l : { ...l, batches: l.batches.filter((b) => b.key !== key) }))
}

export function setClose(form: ReceiveForm, close: boolean): ReceiveForm {
  return { ...form, close }
}

// ── Scanning ─────────────────────────────────────────────────────────────────

/** The order line a scanned pack belongs to (by GTIN or stored raw barcode). */
export function findScannedItem(items: PoItem[], scan: ScanFields): PoItem | null {
  return receivableItems(items).find((i) => scanMatchesProduct(scan, { gtin: i.gtin, barcode_raw: i.barcode_raw })) ?? null
}

/**
 * Put a scan's batch/expiry into the line's first row still missing either;
 * when every row is filled and this is a different lot, start a new batch row
 * (web behaviour). Ticks the line. `filledKey` is null when there was nothing
 * to fill (same lot scanned again, or the line is at its batch limit).
 */
export function fillFromScan(form: ReceiveForm, itemId: string, scan: ScanFields): { form: ReceiveForm; filledKey: string | null } {
  let next = setIncluded(form, itemId, true)
  const line = next.lines[itemId]
  if (!line) return { form, filledKey: null }
  let target = line.batches.find((b) => !b.batchNumber.trim() || !b.expiry)
  if (!target && scan.batchNumber && !line.batches.some((b) => b.batchNumber.trim() === scan.batchNumber)) {
    const added = addBatch(next, itemId)
    if (added !== next) {
      next = added
      const rows = next.lines[itemId]!.batches
      target = rows[rows.length - 1]
    }
  }
  if (!target) return { form: next, filledKey: null }
  const patch: Partial<BatchDraft> = {}
  if (scan.batchNumber) patch.batchNumber = scan.batchNumber
  if (scan.expiry) patch.expiry = scan.expiry
  return { form: updateBatch(next, itemId, target.key, patch), filledKey: target.key }
}

// ── Preview maths ────────────────────────────────────────────────────────────

export interface BatchPreview {
  /** Base units this batch adds (null while packs are invalid). */
  units: number | null
  /** Cost per base unit the server will store (null when no cost). */
  costPerUnit: number | null
  /** Entered cost vs the PO's expected cost per pack, in cents (null when equal / unknown). */
  costDiffCents: number | null
}

/** Effective cost per pack: typed value, else the PO's expected cost (server rule). */
function effectiveCost(batch: BatchDraft, item: PoItem): number | null {
  if (batch.unitCost.trim()) return parseAmount(batch.unitCost)
  return item.unit_cost
}

export function batchPreview(batch: BatchDraft, item: PoItem, canSeeCost: boolean): BatchPreview {
  const packs = parsePacks(batch.packs)
  const units = packs == null ? null : packsToUnits(packs, item.units_per_pack)
  if (!canSeeCost) return { units, costPerUnit: null, costDiffCents: null }
  const cost = effectiveCost(batch, item)
  const typed = batch.unitCost.trim() ? parseAmount(batch.unitCost) : null
  const diff = typed != null && item.unit_cost != null ? Math.round(typed * 100) - Math.round(item.unit_cost * 100) : 0
  return {
    units,
    costPerUnit: cost == null ? null : costPerUnit(cost, item.units_per_pack),
    costDiffCents: diff === 0 ? null : diff,
  }
}

/** Would the order still have items outstanding after this delivery? (shows the "close" toggle) */
export function isShort(form: ReceiveForm, items: PoItem[]): boolean {
  return receivableItems(items).some((i) => {
    const line = form.lines[i.id]
    if (!line?.included) return i.quantity_received < i.quantity_ordered
    const packs = line.batches.reduce((s, b) => s + (parsePacks(b.packs) ?? 0), 0)
    return i.quantity_received + packs < i.quantity_ordered
  })
}

// ── Validation + payload ─────────────────────────────────────────────────────

const isBlankBatch = (b: BatchDraft) => !b.batchNumber.trim() && !b.expiry

function validateBatch(b: BatchDraft, today: string, canSeeCost: boolean): BatchErrors {
  const e: BatchErrors = {}
  const num = b.batchNumber.trim()
  if (!num) e.batchNumber = "Enter the batch number"
  else if (num.length > MAX_BATCH_NUMBER) e.batchNumber = `Batch number is too long (${MAX_BATCH_NUMBER} characters max)`
  if (!b.expiry) e.expiry = "Pick the expiry date"
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(b.expiry)) e.expiry = "Pick a valid expiry date"
  else if (b.expiry <= today) e.expiry = "This batch has already expired"
  const packs = parsePacks(b.packs)
  if (packs == null) e.packs = "Enter how many packs arrived"
  else if (packs > MAX_PACKS) e.packs = "That's more packs than one delivery can hold"
  if (canSeeCost && b.unitCost.trim() && parseAmount(b.unitCost) == null) e.unitCost = "Enter a valid cost, e.g. 450 or 450.50"
  return e
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

/**
 * Validate the form and build the API body. Unticked lines are dropped; within
 * a ticked line, rows left completely blank (no batch number, no expiry) are
 * dropped when another row has data. unit_cost is sent only when the viewer
 * can see cost AND typed one — otherwise the server uses the PO's cost.
 * `today` is Nairobi's YYYY-MM-DD (expiry must be after it, like the server).
 */
export function buildReceivePayload(
  form: ReceiveForm,
  items: PoItem[],
  opts: { canSeeCost: boolean; today: string },
): ReceiveResult {
  const errors: Record<string, BatchErrors> = {}
  const lineErrors: Record<string, string> = {}
  const problems: string[] = []
  const lines: ReceivePayload["lines"] = []
  const summary: ReceiveSummary = { lines: 0, batches: 0, packs: 0, units: 0, invoiceCents: opts.canSeeCost ? 0 : null }

  for (const item of receivableItems(items)) {
    const line = form.lines[item.id]
    if (!line?.included) continue
    const filled = line.batches.filter((b) => !isBlankBatch(b))
    const rows = filled.length > 0 ? filled : line.batches
    summary.lines++
    if (rows.length > MAX_BATCHES_PER_LINE) {
      lineErrors[item.id] = `At most ${MAX_BATCHES_PER_LINE} batches per item`
      problems.push(`${item.product_name}: ${lowerFirst(lineErrors[item.id]!)}`)
    }
    const batches: ReceiveBatchPayload[] = []
    rows.forEach((b, n) => {
      const e = validateBatch(b, opts.today, opts.canSeeCost)
      const msgs = Object.values(e)
      if (msgs.length > 0) {
        errors[b.key] = e
        const where = `${item.product_name}${rows.length > 1 ? ` (batch ${n + 1})` : ""}`
        for (const m of msgs) problems.push(`${where}: ${lowerFirst(m)}`)
      }
      const packs = parsePacks(b.packs) ?? 0
      summary.batches++
      summary.packs += packs
      summary.units += packsToUnits(packs, item.units_per_pack)
      const typedCost = opts.canSeeCost && b.unitCost.trim() ? parseAmount(b.unitCost) : null
      if (summary.invoiceCents != null) {
        const cost = typedCost ?? item.unit_cost
        if (cost != null) summary.invoiceCents += Math.round(cost * 100) * packs
      }
      batches.push({
        batch_number: b.batchNumber.trim(),
        expiry_date: b.expiry,
        quantity: packs,
        ...(typedCost != null ? { unit_cost: Math.round(typedCost * 100) / 100 } : {}),
      })
    })
    lines.push({ item_id: item.id, batches })
  }

  if (lines.length === 0) problems.unshift("Tick at least one item that arrived")
  const payload = problems.length === 0 ? { lines, close: form.close && isShort(form, items) } : null
  return { payload, errors, lineErrors, problems, summary }
}
