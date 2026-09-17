import { sqliteTable, text, integer, real, primaryKey } from "drizzle-orm/sqlite-core"

// ── Existing tables (unchanged) ─────────────────────────────────────────────
// Mirrors the `product_stock` view fields returned by
// GET /api/products/search?all=1&branch_id= (apps/web/app/api/products/search/route.ts)
// — the full-set catalogue fetch this app caches locally. For the ONLINE app
// this is a read-only, re-seeded-wholesale mirror (see lib/sync/catalogue.ts).
// For the OFFLINE EDITION build (ADR-014) this same table becomes the actual
// source of truth: Products/Categories/Suppliers screens create/edit these
// rows directly, no server round trip.
export const products = sqliteTable("products", {
  productId: text("product_id").primaryKey(),
  name: text("name").notNull(),
  brandName: text("brand_name"),
  genericName: text("generic_name"),
  strength: text("strength"),
  dosageForm: text("dosage_form"),
  baseUnit: text("base_unit").notNull(),
  packLabel: text("pack_label"),
  unitsPerPack: integer("units_per_pack").notNull(),
  sellingPrice: real("selling_price").notNull(),
  costPrice: real("cost_price"),
  reorderLevel: integer("reorder_level").notNull(),
  isControlled: integer("is_controlled", { mode: "boolean" }).notNull(),
  requiresPrescription: integer("requires_prescription", { mode: "boolean" }).notNull(),
  gtin: text("gtin"),
  barcodeRaw: text("barcode_raw"),
  categoryId: text("category_id"),
  isActive: integer("is_active", { mode: "boolean" }).notNull(),
  imageUrl: text("image_url"),
  maxDiscountPercent: real("max_discount_percent"),
  catalogId: text("catalog_id"),
  stockOnHand: integer("stock_on_hand").notNull(),
  earliestExpiry: text("earliest_expiry"),
  batchCount: integer("batch_count").notNull(),
  // Offline Edition only: which supplier this product's default reorders
  // come from — the online app has no equivalent column here (it lives on
  // the server `product` row and isn't part of the product_stock mirror).
  supplierId: text("supplier_id"),
})

// Mirrors the Dexie `offlineSales` store (apps/web/lib/offline/db.ts) — one row
// per queued sale, used by the ONLINE app's "sell offline, sync when back on
// the internet" flow. NOT used by the Offline Edition build, which has no
// server to sync to — see `sales`/`saleItems`/`payments` below instead.
export const queuedSales = sqliteTable("queued_sales", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  offlineReference: text("offline_reference").notNull().unique(),
  branchId: text("branch_id").notNull(),
  payload: text("payload").notNull(),
  status: text("status", { enum: ["pending", "synced", "rejected"] }).notNull(),
  serverResponse: text("server_response"),
  errorMessage: text("error_message"),
  createdAt: integer("created_at").notNull(),
})

// Last-known-good cache for data that's normally server-fetched (session/branch
// context, active shift) so a cold app start with no connectivity can still
// serve the offline POS instead of blocking behind a network error — see
// lib/kv.ts. Not a general settings store; only what POS needs offline.
export const kvStore = sqliteTable("kv_store", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
})

// ── Offline Edition tables (ADR-014, Phase 2) ───────────────────────────────
// Everything below exists ONLY for the fully-offline, single-tenant Android
// build — the online app never reads/writes these. No `organization_id` on
// any of them (single-tenant install, nothing to scope by). Money is stored
// as INTEGER CENTS throughout (CLAUDE.md §2.4) — the pre-existing `products`
// table above predates that convention (real/float) and is left as-is rather
// than risk breaking the online app's POS/cart code that already reads it.

export const branches = sqliteTable("branches", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone"),
  address: text("address"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
})

// Local-only staff/auth — no server `user`/`staff_profile` row exists at all.
// pinHash/pinSalt use the SAME salted-SHA256 scheme as the online app's
// device-users.ts offline fallback (see lib/local-auth.ts), just as the
// PRIMARY credential store instead of a cache of a server-verified PIN.
export const staff = sqliteTable("staff", {
  id: text("id").primaryKey(),
  fullName: text("full_name").notNull(),
  phone: text("phone").notNull().unique(),
  role: text("role", { enum: ["owner", "manager", "pharmacist", "cashier"] }).notNull(),
  pinHash: text("pin_hash").notNull(),
  pinSalt: text("pin_salt").notNull(),
  branchId: text("branch_id"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at").notNull(),
})

export const categories = sqliteTable("categories", {
  id: text("id").primaryKey(),
  parentId: text("parent_id"),
  name: text("name").notNull(),
})

export const suppliers = sqliteTable("suppliers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),
})

// Additional pack sizes beyond the single base pack already flattened onto
// `products` (packLabel/unitsPerPack/sellingPrice/costPrice) — mirrors web's
// product_pack_size as a one-to-many, matching NewProductDialog/EditProductSheet
// letting a product be sold in more than one pack size.
export const productPackSizes = sqliteTable("product_pack_sizes", {
  id: text("id").primaryKey(),
  productId: text("product_id").notNull(),
  label: text("label").notNull(),
  unitCount: integer("unit_count").notNull().default(1),
  sellingPriceCents: integer("selling_price_cents").notNull(),
  costPriceCents: integer("cost_price_cents"),
  barcode: text("barcode"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
})

export const productBatches = sqliteTable("product_batches", {
  id: text("id").primaryKey(),
  productId: text("product_id").notNull(),
  branchId: text("branch_id").notNull(),
  supplierId: text("supplier_id"),
  batchNumber: text("batch_number").notNull(),
  expiryDate: text("expiry_date").notNull(), // ISO date (YYYY-MM-DD)
  quantityReceived: integer("quantity_received").notNull(),
  quantityRemaining: integer("quantity_remaining").notNull(),
  costPriceCents: integer("cost_price_cents"),
  receivedAt: integer("received_at").notNull(), // epoch ms
})

export const stockAdjustments = sqliteTable("stock_adjustments", {
  id: text("id").primaryKey(),
  batchId: text("batch_id").notNull(),
  reason: text("reason").notNull(),
  delta: integer("delta").notNull(),
  quantityBefore: integer("quantity_before").notNull(),
  quantityAfter: integer("quantity_after").notNull(),
  note: text("note"),
  adjustedBy: text("adjusted_by"),
  createdAt: integer("created_at").notNull(),
})

// PPB-mandated dispensing register (CLAUDE.md §6.14) — one row per controlled
// sale_item, enforced client-side when product.isControlled at checkout.
export const controlledSubstanceLog = sqliteTable("controlled_substance_log", {
  id: text("id").primaryKey(),
  saleItemId: text("sale_item_id"),
  pharmacistName: text("pharmacist_name"),
  pharmacistReg: text("pharmacist_reg"),
  prescriberName: text("prescriber_name"),
  prescriberReg: text("prescriber_reg"),
  patientId: text("patient_id"),
  quantity: integer("quantity").notNull(),
  batchNumber: text("batch_number"),
  createdAt: integer("created_at").notNull(),
})

export const shifts = sqliteTable("shifts", {
  id: text("id").primaryKey(),
  branchId: text("branch_id").notNull(),
  cashierId: text("cashier_id").notNull(),
  openingFloatCents: integer("opening_float_cents").notNull().default(0),
  closingCashCents: integer("closing_cash_cents"),
  varianceCents: integer("variance_cents"),
  notes: text("notes"),
  openedAt: integer("opened_at").notNull(),
  closedAt: integer("closed_at"),
})

// Completed sales — the offline build's real ledger, unlike `queuedSales`
// above (which is a pending-sync queue for the ONLINE app; there is nothing
// to sync to here, so a completed sale is written straight into these three
// tables in one local transaction, mirroring web's sale/sale_item/payment).
export const sales = sqliteTable("sales", {
  id: text("id").primaryKey(),
  branchId: text("branch_id").notNull(),
  shiftId: text("shift_id"),
  cashierId: text("cashier_id"),
  receiptNumber: text("receipt_number"),
  status: text("status").notNull().default("completed"),
  subtotalCents: integer("subtotal_cents").notNull().default(0),
  discountAmountCents: integer("discount_amount_cents").notNull().default(0),
  taxAmountCents: integer("tax_amount_cents").notNull().default(0),
  totalAmountCents: integer("total_amount_cents").notNull().default(0),
  paymentMethod: text("payment_method").notNull(),
  customerId: text("customer_id"),
  amountTenderedCents: integer("amount_tendered_cents"),
  changeGivenCents: integer("change_given_cents"),
  customerName: text("customer_name"),
  customerPhone: text("customer_phone"),
  createdAt: integer("created_at").notNull(),
})

export const saleItems = sqliteTable("sale_items", {
  id: text("id").primaryKey(),
  saleId: text("sale_id").notNull(),
  productId: text("product_id"),
  batchId: text("batch_id"),
  productName: text("product_name").notNull(),
  quantity: integer("quantity").notNull(),
  unitPriceCents: integer("unit_price_cents").notNull(),
  discountPercent: real("discount_percent").notNull().default(0),
  lineTotalCents: integer("line_total_cents").notNull(),
  baseUnit: text("base_unit"),
  productStrength: text("product_strength"),
})

export const payments = sqliteTable("payments", {
  id: text("id").primaryKey(),
  saleId: text("sale_id").notNull(),
  method: text("method").notNull(),
  amountCents: integer("amount_cents").notNull(),
  mpesaCheckoutId: text("mpesa_checkout_id"),
  mpesaReceipt: text("mpesa_receipt"),
  createdAt: integer("created_at").notNull(),
})

export const customers = sqliteTable("customers", {
  id: text("id").primaryKey(),
  fullName: text("full_name").notNull(),
  phone: text("phone"),
  email: text("email"),
  dateOfBirth: text("date_of_birth"), // ISO date
  sex: text("sex"),
  allergies: text("allergies"),
  notes: text("notes"),
  remindersOptIn: integer("reminders_opt_in", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at").notNull(),
})

export const appointmentServices = sqliteTable("appointment_services", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull(),
  label: text("label").notNull(),
  recurrenceWeeks: integer("recurrence_weeks"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
})

// No `appointment_reminder`/send channel tables — reminders need SMS/WhatsApp/
// email, which need internet. Offline Edition appointments just show a local
// "due today/overdue" list on the Appointments screen instead (see plan).
export const appointments = sqliteTable("appointments", {
  id: text("id").primaryKey(),
  branchId: text("branch_id"),
  customerId: text("customer_id").notNull(),
  serviceId: text("service_id"),
  serviceLabel: text("service_label"),
  scheduledAt: integer("scheduled_at").notNull(), // epoch ms
  durationMinutes: integer("duration_minutes").notNull().default(15),
  status: text("status").notNull().default("scheduled"),
  assignedTo: text("assigned_to"),
  notes: text("notes"),
  parentAppointmentId: text("parent_appointment_id"),
  nextDueDate: text("next_due_date"), // ISO date
  createdAt: integer("created_at").notNull(),
})

export const prescriptions = sqliteTable("prescriptions", {
  id: text("id").primaryKey(),
  customerId: text("customer_id"),
  prescriberName: text("prescriber_name"),
  prescriberRegNo: text("prescriber_reg_no"),
  diagnosis: text("diagnosis"),
  notes: text("notes"),
  status: text("status").notNull().default("active"),
  saleId: text("sale_id"),
  createdAt: integer("created_at").notNull(),
})

export const prescriptionItems = sqliteTable("prescription_items", {
  id: text("id").primaryKey(),
  prescriptionId: text("prescription_id").notNull(),
  productId: text("product_id"),
  drugName: text("drug_name"),
  strength: text("strength"),
  dose: text("dose"),
  quantity: integer("quantity"),
  frequency: text("frequency"),
  duration: text("duration"),
  instructions: text("instructions"),
})

// Seeded once from a bundled JSON asset at first run (see lib/local-auth.ts
// setup flow) — read-only reference data for DUR checks, never edited by staff.
export const drugInteractions = sqliteTable("drug_interactions", {
  id: text("id").primaryKey(),
  drugA: text("drug_a").notNull(),
  drugB: text("drug_b").notNull(),
  severity: text("severity").notNull(),
  note: text("note"),
})

export const auditLog = sqliteTable("audit_log", {
  id: text("id").primaryKey(),
  actorId: text("actor_id"),
  action: text("action").notNull(),
  entity: text("entity"),
  entityId: text("entity_id"),
  diff: text("diff"),
  createdAt: integer("created_at").notNull(),
})

// Local per-branch/day receipt sequence, replacing the server's
// `nextval('receipt_number_seq')` — see lib/receipt-number.ts.
export const receiptCounters = sqliteTable("receipt_counters", {
  branchId: text("branch_id").notNull(),
  dateKey: text("date_key").notNull(), // YYMMDD, Africa/Nairobi
  lastSeq: integer("last_seq").notNull().default(0),
}, (t) => [primaryKey({ columns: [t.branchId, t.dateKey] })])

export type ProductRow = typeof products.$inferSelect
export type QueuedSaleRow = typeof queuedSales.$inferSelect
export type BranchRow = typeof branches.$inferSelect
export type StaffRow = typeof staff.$inferSelect
export type CategoryRow = typeof categories.$inferSelect
export type SupplierRow = typeof suppliers.$inferSelect
export type ProductPackSizeRow = typeof productPackSizes.$inferSelect
export type ProductBatchRow = typeof productBatches.$inferSelect
export type StockAdjustmentRow = typeof stockAdjustments.$inferSelect
export type ShiftRow = typeof shifts.$inferSelect
export type SaleRow = typeof sales.$inferSelect
export type SaleItemRow = typeof saleItems.$inferSelect
export type PaymentRow = typeof payments.$inferSelect
export type CustomerRow = typeof customers.$inferSelect
export type AppointmentServiceRow = typeof appointmentServices.$inferSelect
export type AppointmentRow = typeof appointments.$inferSelect
export type PrescriptionRow = typeof prescriptions.$inferSelect
export type PrescriptionItemRow = typeof prescriptionItems.$inferSelect
export type DrugInteractionRow = typeof drugInteractions.$inferSelect
