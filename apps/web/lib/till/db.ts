import Dexie, { type Table } from "dexie"
import type { ClockAnchors, OverrideRecord, PushItemPayload } from "@pharmatrack/core/sync"

// Offline till database (IndexedDB) for a browser or desktop app registered
// as a device — the web twin of the Android app's SQLite tables
// (apps/mobile/src/db/schema.ts). Separate from lib/offline/db.ts, which is
// the older "queue a sale when the network drops" cache used by browsers that
// were never registered.
//
// Every business write (sale, shift open/close, manager unlock) and its
// outbox row are written in ONE Dexie transaction, so the two can never
// disagree. IndexedDB serialises read-write transactions across tabs, which
// is what keeps receipt numbers and stock allowances safe with two tabs open.

export interface TillProduct {
  id: string
  name: string
  /** lower-cased name + brand + generic + strength, for offline search */
  search: string
  brand_name: string | null
  generic_name: string | null
  strength: string | null
  dosage_form: string | null
  base_unit: string
  pack_label: string | null
  units_per_pack: number
  /** KES per base unit */
  selling_price: number
  max_discount_percent: number | null
  gtin: string | null
  barcode_raw: string | null
  category_id: string | null
  image_url: string | null
  is_controlled: boolean
  requires_prescription: boolean
  is_active: boolean
  /** server stock − this till's unsynced sales */
  stock_on_hand: number
  earliest_expiry: string | null
}

export interface TillPack {
  id: string
  product_id: string
  label: string
  unit_count: number
  /** KES per pack */
  selling_price: number
  barcode: string | null
  is_active: boolean
}

export interface TillStaff {
  id: string
  name: string
  role: string
  phone: string | null
  branch_id: string | null
  is_active: boolean
  /** the server's bcrypt PIN hash (the one PIN sign-in checks) */
  pin_hash: string | null
  permissions: string[]
  failed_attempts: number
  locked_until: number | null
}

export interface TillAllowance {
  product_id: string
  quantity: number
  reserved_until: string | null
}

export type OutboxStatus = "pending" | "synced" | "rejected" | "dismissed"

export interface OutboxRow {
  seq?: number
  /** unique row key (a shift's open and close share its client_id) */
  key: string
  client_id: string
  type: PushItemPayload["type"]
  payload: PushItemPayload
  summary: string
  status: OutboxStatus
  error_code: string | null
  error_message: string | null
  server_id: string | null
  flags: string[] | null
  attempts: number
  created_at: number
  synced_at: number | null
}

export interface TillShift {
  client_id: string
  cashier_id: string
  cashier_name: string
  opened_at: number
  opening_float_cents: number
  cash_sales_cents: number
  sales_count: number
  closed_at: number | null
  closing_cash_cents: number | null
  notes: string | null
  closed_by: string | null
  /** 1 while open — IndexedDB can't index null or booleans */
  open: 0 | 1
}

export interface TillCounter {
  /** `${deviceCode}:${YYMMDD}` */
  key: string
  last_seq: number
}

export interface DeviceInfo {
  id: string
  name: string
  code: string
  branchId: string
  branchName: string | null
  organizationId: string | null
  organizationName: string | null
}

export interface BranchInfo {
  id: string
  name: string | null
  address: string | null
  phone: string | null
}

/** Who is selling right now (the signed-in user, or a PIN switch). */
export interface TillStaffSession {
  id: string
  name: string
  role: string
}

export interface SyncMeta {
  cursor: string | null
  /** epoch ms of the current sync deadline (Nairobi midnight) */
  deadline: number | null
  lastSyncAt: number | null
  clock: ClockAnchors
  override: OverrideRecord | null
  revoked: boolean
  subscriptionInactive: boolean
}

export interface MetaValues {
  device: DeviceInfo
  token: string
  sync: SyncMeta
  branch: BranchInfo
  staff: TillStaffSession
}

interface MetaRow<K extends keyof MetaValues = keyof MetaValues> {
  key: K
  value: MetaValues[K]
}

export class TillDB extends Dexie {
  products!: Table<TillProduct, string>
  packs!: Table<TillPack, string>
  staff!: Table<TillStaff, string>
  allowances!: Table<TillAllowance, string>
  outbox!: Table<OutboxRow, number>
  shifts!: Table<TillShift, string>
  counters!: Table<TillCounter, string>
  meta!: Table<MetaRow, string>

  constructor(name = "pharmatrack-till") {
    super(name)
    this.version(1).stores({
      products: "id, gtin, barcode_raw",
      packs: "id, product_id, barcode",
      staff: "id",
      allowances: "product_id",
      outbox: "++seq, &key, status, [status+type], type",
      shifts: "client_id, cashier_id, open",
      counters: "key",
      meta: "key",
    })
  }
}

let instance: TillDB | null = null

/** The till database (one per browser profile). Tests swap it with setTillDB(). */
export function tillDB(): TillDB {
  if (!instance) instance = new TillDB()
  return instance
}

export function setTillDB(db: TillDB): void {
  instance = db
}

export async function getMeta<K extends keyof MetaValues>(key: K, db = tillDB()): Promise<MetaValues[K] | null> {
  const row = (await db.meta.get(key)) as MetaRow<K> | undefined
  return row ? row.value : null
}

export async function setMeta<K extends keyof MetaValues>(key: K, value: MetaValues[K], db = tillDB()): Promise<void> {
  await db.meta.put({ key, value } as MetaRow)
}

export async function deleteMeta(key: keyof MetaValues, db = tillDB()): Promise<void> {
  await db.meta.delete(key)
}
