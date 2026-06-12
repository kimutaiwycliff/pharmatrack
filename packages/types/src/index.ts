// Domain types for PharmaTrack — kept in sync with supabase/migrations/001_initial_schema.sql

export type UserRole = "owner" | "manager" | "pharmacist" | "cashier"
export type PaymentMethod = "cash" | "mpesa" | "split"
export type SaleStatus = "completed" | "voided"
export type ControlledTransactionType = "sale" | "adjustment" | "return"

export interface Organization {
  id: string
  name: string
  registration_number: string | null
  phone: string | null
  email: string | null
  address: string | null
  logo_url: string | null
  settings: Record<string, unknown>
  created_at: string
}

export interface Branch {
  id: string
  organization_id: string
  name: string
  address: string | null
  phone: string | null
  is_active: boolean
  created_at: string
}

export interface Profile {
  id: string
  organization_id: string
  branch_id: string | null
  full_name: string
  phone: string | null
  role: UserRole
  pin_hash: string | null
  is_active: boolean
  created_at: string
}

export interface Category {
  id: string
  organization_id: string
  name: string
  parent_id: string | null
  created_at: string
}

// Category with its subcategories nested (for two-level pickers/managers)
export interface CategoryWithChildren {
  id: string
  name: string
  parent_id: string | null
  children: Array<{ id: string; name: string; parent_id: string }>
}

export interface Supplier {
  id: string
  organization_id: string
  name: string
  phone: string | null
  email: string | null
  address: string | null
  is_active: boolean
  created_at: string
}

export interface Product {
  id: string
  organization_id: string
  category_id: string | null
  supplier_id: string | null
  name: string
  brand_name: string | null
  manufacturer: string | null
  strength: string | null
  dosage_form: string | null
  gtin: string | null
  barcode_raw: string | null
  base_unit: string
  units_per_pack: number
  pack_label: string | null
  selling_price: number
  cost_price: number | null
  reorder_level: number
  reorder_quantity: number
  requires_prescription: boolean
  is_controlled: boolean
  is_active: boolean
  image_url: string | null
  max_discount_percent: number | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface ProductPackSize {
  id: string
  product_id: string
  pack_label: string
  units_per_pack: number
  selling_price: number
  barcode: string | null
  is_active: boolean
  created_at: string
}

export interface ProductBatch {
  id: string
  product_id: string
  branch_id: string
  supplier_id: string | null
  batch_number: string
  expiry_date: string
  manufactured_date: string | null
  quantity_received: number
  quantity_remaining: number
  cost_price: number | null
  purchase_order_id: string | null
  received_by: string | null
  received_at: string
  notes: string | null
  created_at: string
}

export type StockAdjustmentReason =
  | "count_correction"
  | "damage"
  | "expiry"
  | "theft_loss"
  | "return"
  | "other"

export interface StockAdjustment {
  id: string
  organization_id: string
  branch_id: string
  product_id: string
  batch_id: string
  delta: number
  quantity_before: number
  quantity_after: number
  reason: StockAdjustmentReason
  note: string | null
  adjusted_by: string | null
  created_at: string
}

export interface ProductStock {
  product_id: string | null
  branch_id: string | null
  organization_id: string | null
  name: string | null
  brand_name: string | null
  strength: string | null
  dosage_form: string | null
  gtin: string | null
  barcode_raw: string | null
  base_unit: string | null
  units_per_pack: number | null
  pack_label: string | null
  selling_price: number | null
  cost_price: number | null
  category_id: string | null
  reorder_level: number | null
  requires_prescription: boolean | null
  is_controlled: boolean | null
  is_active: boolean | null
  image_url: string | null
  max_discount_percent: number | null
  stock_on_hand: number | null
  earliest_expiry: string | null
  batch_count: number | null
}

export interface Sale {
  id: string
  branch_id: string
  cashier_id: string
  shift_id: string | null
  receipt_number: string
  payment_method: PaymentMethod
  status: SaleStatus
  subtotal: number
  discount_amount: number
  tax_amount: number
  total_amount: number
  amount_tendered: number | null
  change_given: number | null
  mpesa_reference: string | null
  customer_name: string | null
  customer_phone: string | null
  notes: string | null
  voided_at: string | null
  voided_by: string | null
  created_at: string
}

export interface SaleItem {
  id: string
  sale_id: string
  product_id: string
  batch_id: string | null
  product_name: string
  product_strength: string | null
  base_unit: string
  quantity: number
  unit_price: number
  discount_percent: number
  line_total: number
  created_at: string
}

export interface Shift {
  id: string
  branch_id: string
  staff_id: string
  opening_float: number
  closing_cash: number | null
  clocked_in_at: string
  clocked_out_at: string | null
  notes: string | null
  created_at: string
}

export interface ControlledSubstanceLog {
  id: string
  branch_id: string
  product_id: string
  batch_id: string
  sale_id: string | null
  transaction_type: ControlledTransactionType
  quantity: number
  balance_after: number
  recorded_by: string
  prescription_number: string | null
  prescriber_name: string | null
  patient_name: string | null
  created_at: string
}

// Composite: product row joined with stock info
export type ProductWithStock = ProductStock

// Composite: sale with its line items (used in receipt rendering)
export type SaleWithItems = Sale & { items: SaleItem[] }

// POS cart item (in-memory before sale is committed)
export interface CartItem {
  product_id: string
  product_name: string
  product_strength: string | null
  batch_id: string | null
  quantity: number
  unit_price: number
  discount_percent: number
  line_total: number
  base_unit: string
  is_controlled: boolean
  max_discount_percent: number | null
}

// ─── Appointments / booking ──────────────────────────────────
export interface Customer {
  id: string
  organization_id: string
  full_name: string
  phone: string | null
  email: string | null
  notes: string | null
  reminders_opt_in: boolean
  date_of_birth: string | null
  sex: string | null
  allergies: string | null
  created_by: string | null
  created_at: string
}

// ─── Prescriptions / DUR ─────────────────────────────────────
export type PrescriptionStatus = "active" | "completed" | "cancelled"

export interface PrescriptionItem {
  id: string
  prescription_id: string
  product_id: string | null
  drug_name: string
  dose: string | null
  frequency: string | null
  duration: string | null
  quantity: number | null
  instructions: string | null
  created_at: string
}

export interface Prescription {
  id: string
  organization_id: string
  customer_id: string
  prescriber_name: string | null
  prescriber_reg_no: string | null
  diagnosis: string | null
  notes: string | null
  status: PrescriptionStatus
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface PrescriptionWithRelations extends Prescription {
  customer: Pick<Customer, "id" | "full_name" | "phone" | "allergies"> | null
  items: PrescriptionItem[]
}

// A single Drug Utilization Review finding raised at prescribing time.
export interface DurWarning {
  type: "allergy" | "duplicate" | "interaction"
  severity: "minor" | "moderate" | "severe"
  message: string
}

export type AppointmentStatus =
  | "scheduled"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "no_show"

export interface AppointmentService {
  id: string
  organization_id: string
  slug: string
  label: string
  recurrence_weeks: number | null
  is_active: boolean
  sort_order: number
  created_at: string
}

export interface Appointment {
  id: string
  organization_id: string
  branch_id: string
  customer_id: string
  service: string
  service_label: string | null
  scheduled_at: string
  duration_minutes: number
  assigned_to: string | null
  status: AppointmentStatus
  notes: string | null
  next_due_date: string | null
  parent_appointment_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

// Appointment joined with related rows for list/agenda views
export interface AppointmentWithRelations extends Appointment {
  customer: Pick<Customer, "id" | "full_name" | "phone" | "email"> | null
  assignee: Pick<Profile, "id" | "full_name"> | null
}

export interface AppointmentReminder {
  id: string
  appointment_id: string
  organization_id: string
  channel: "sms" | "email"
  recipient: "customer" | "pharmacist"
  send_at: string
  status: "pending" | "sent" | "failed" | "skipped"
  sent_at: string | null
  error: string | null
  created_at: string
}

// ─── SaaS: plans, subscriptions, platform ────────────────────
export interface Plan {
  id: string
  code: string
  name: string
  price_kes: number
  interval: "monthly" | "annual"
  limits: Record<string, unknown>
  features: Record<string, unknown>
  is_active: boolean
  created_at: string
}

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "suspended"
  | "cancelled"

export interface Subscription {
  id: string
  organization_id: string
  plan_id: string | null
  status: SubscriptionStatus
  trial_ends_at: string | null
  current_period_end: string | null
  provider: string | null
  provider_customer_id: string | null
  provider_subscription_id: string | null
  created_at: string
  updated_at: string
}

export interface SubscriptionPayment {
  id: string
  organization_id: string
  amount_kes: number
  method: string | null
  period_start: string | null
  period_end: string | null
  reference: string | null
  recorded_by: string | null
  created_at: string
}

// Tenant row for the platform console (org + its subscription + counts)
export interface TenantSummary {
  id: string
  name: string
  email: string | null
  phone: string | null
  created_at: string
  subscription: Subscription | null
  plan_name: string | null
  branch_count: number
  staff_count: number
}

// Shift summary for the shift report screen
export interface ShiftSummary {
  shift: Shift
  cashier: Pick<Profile, "id" | "full_name" | "role">
  sale_count: number
  total_sales: number
  cash_sales: number
  mpesa_sales: number
  opening_float: number
  closing_cash: number | null
  variance: number | null
}
