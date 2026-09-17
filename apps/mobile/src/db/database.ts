import { openDatabaseSync } from "expo-sqlite"
import { drizzle } from "drizzle-orm/expo-sqlite"
import * as schema from "./schema"

const sqliteDb = openDatabaseSync("pharmatrack.db")

export const db = drizzle(sqliteDb, { schema })

// SQLite has no `ADD COLUMN IF NOT EXISTS` — run this one alone, before the
// main block, so a second run (where the column already exists and this
// throws) doesn't abort the CREATE TABLE IF NOT EXISTS statements below it.
try {
  sqliteDb.execSync(`ALTER TABLE products ADD COLUMN supplier_id TEXT;`)
} catch {
  // already added on a previous run — expected, not an error worth surfacing
}
try {
  sqliteDb.execSync(`ALTER TABLE products ADD COLUMN manufacturer TEXT;`)
} catch {
  // already added on a previous run
}
try {
  sqliteDb.execSync(`ALTER TABLE branches ADD COLUMN registration_number TEXT;`)
} catch {
  // already added on a previous run
}
try {
  sqliteDb.execSync(`ALTER TABLE branches ADD COLUMN email TEXT;`)
} catch {
  // already added on a previous run
}

// Create tables on first run. No migration framework needed for a schema this
// small — if a column is added later, bump this to a real migration rather
// than editing the CREATE TABLE below in place.
sqliteDb.execSync(`
  CREATE TABLE IF NOT EXISTS products (
    product_id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    brand_name TEXT,
    generic_name TEXT,
    strength TEXT,
    dosage_form TEXT,
    base_unit TEXT NOT NULL,
    pack_label TEXT,
    units_per_pack INTEGER NOT NULL,
    selling_price REAL NOT NULL,
    cost_price REAL,
    reorder_level INTEGER NOT NULL,
    is_controlled INTEGER NOT NULL,
    requires_prescription INTEGER NOT NULL,
    gtin TEXT,
    barcode_raw TEXT,
    category_id TEXT,
    is_active INTEGER NOT NULL,
    image_url TEXT,
    max_discount_percent REAL,
    catalog_id TEXT,
    stock_on_hand INTEGER NOT NULL,
    earliest_expiry TEXT,
    batch_count INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_products_barcode_raw ON products(barcode_raw);
  CREATE INDEX IF NOT EXISTS idx_products_gtin ON products(gtin);

  CREATE TABLE IF NOT EXISTS queued_sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    offline_reference TEXT NOT NULL UNIQUE,
    branch_id TEXT NOT NULL,
    payload TEXT NOT NULL,
    status TEXT NOT NULL,
    server_response TEXT,
    error_message TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_queued_sales_status ON queued_sales(status);

  CREATE TABLE IF NOT EXISTS kv_store (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );

  -- Offline Edition tables (ADR-014, Phase 2) — see schema.ts for the
  -- matching Drizzle definitions and per-table rationale. Single-tenant
  -- install: no organization_id anywhere.

  CREATE TABLE IF NOT EXISTS branches (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    phone TEXT,
    address TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    registration_number TEXT,
    email TEXT
  );

  CREATE TABLE IF NOT EXISTS staff (
    id TEXT PRIMARY KEY NOT NULL,
    full_name TEXT NOT NULL,
    phone TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL,
    pin_hash TEXT NOT NULL,
    pin_salt TEXT NOT NULL,
    branch_id TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY NOT NULL,
    parent_id TEXT,
    name TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS suppliers (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT
  );

  CREATE TABLE IF NOT EXISTS product_pack_sizes (
    id TEXT PRIMARY KEY NOT NULL,
    product_id TEXT NOT NULL,
    label TEXT NOT NULL,
    unit_count INTEGER NOT NULL DEFAULT 1,
    selling_price_cents INTEGER NOT NULL,
    cost_price_cents INTEGER,
    barcode TEXT,
    is_active INTEGER NOT NULL DEFAULT 1
  );
  CREATE INDEX IF NOT EXISTS idx_product_pack_sizes_product_id ON product_pack_sizes(product_id);

  CREATE TABLE IF NOT EXISTS product_batches (
    id TEXT PRIMARY KEY NOT NULL,
    product_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    supplier_id TEXT,
    batch_number TEXT NOT NULL,
    expiry_date TEXT NOT NULL,
    quantity_received INTEGER NOT NULL,
    quantity_remaining INTEGER NOT NULL,
    cost_price_cents INTEGER,
    received_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_product_batches_product_id ON product_batches(product_id);
  CREATE INDEX IF NOT EXISTS idx_product_batches_expiry_date ON product_batches(expiry_date);

  CREATE TABLE IF NOT EXISTS stock_adjustments (
    id TEXT PRIMARY KEY NOT NULL,
    batch_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    delta INTEGER NOT NULL,
    quantity_before INTEGER NOT NULL,
    quantity_after INTEGER NOT NULL,
    note TEXT,
    adjusted_by TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS controlled_substance_log (
    id TEXT PRIMARY KEY NOT NULL,
    sale_item_id TEXT,
    pharmacist_name TEXT,
    pharmacist_reg TEXT,
    prescriber_name TEXT,
    prescriber_reg TEXT,
    patient_id TEXT,
    quantity INTEGER NOT NULL,
    batch_number TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS shifts (
    id TEXT PRIMARY KEY NOT NULL,
    branch_id TEXT NOT NULL,
    cashier_id TEXT NOT NULL,
    opening_float_cents INTEGER NOT NULL DEFAULT 0,
    closing_cash_cents INTEGER,
    variance_cents INTEGER,
    notes TEXT,
    opened_at INTEGER NOT NULL,
    closed_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS sales (
    id TEXT PRIMARY KEY NOT NULL,
    branch_id TEXT NOT NULL,
    shift_id TEXT,
    cashier_id TEXT,
    receipt_number TEXT,
    status TEXT NOT NULL DEFAULT 'completed',
    subtotal_cents INTEGER NOT NULL DEFAULT 0,
    discount_amount_cents INTEGER NOT NULL DEFAULT 0,
    tax_amount_cents INTEGER NOT NULL DEFAULT 0,
    total_amount_cents INTEGER NOT NULL DEFAULT 0,
    payment_method TEXT NOT NULL,
    customer_id TEXT,
    amount_tendered_cents INTEGER,
    change_given_cents INTEGER,
    customer_name TEXT,
    customer_phone TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at);
  CREATE INDEX IF NOT EXISTS idx_sales_shift_id ON sales(shift_id);

  CREATE TABLE IF NOT EXISTS sale_items (
    id TEXT PRIMARY KEY NOT NULL,
    sale_id TEXT NOT NULL,
    product_id TEXT,
    batch_id TEXT,
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price_cents INTEGER NOT NULL,
    discount_percent REAL NOT NULL DEFAULT 0,
    line_total_cents INTEGER NOT NULL,
    base_unit TEXT,
    product_strength TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items(sale_id);

  CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY NOT NULL,
    sale_id TEXT NOT NULL,
    method TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    mpesa_checkout_id TEXT,
    mpesa_receipt TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_payments_sale_id ON payments(sale_id);

  CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY NOT NULL,
    full_name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    date_of_birth TEXT,
    sex TEXT,
    allergies TEXT,
    notes TEXT,
    reminders_opt_in INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS appointment_services (
    id TEXT PRIMARY KEY NOT NULL,
    slug TEXT NOT NULL,
    label TEXT NOT NULL,
    recurrence_weeks INTEGER,
    is_active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS appointments (
    id TEXT PRIMARY KEY NOT NULL,
    branch_id TEXT,
    customer_id TEXT NOT NULL,
    service_id TEXT,
    service_label TEXT,
    scheduled_at INTEGER NOT NULL,
    duration_minutes INTEGER NOT NULL DEFAULT 15,
    status TEXT NOT NULL DEFAULT 'scheduled',
    assigned_to TEXT,
    notes TEXT,
    parent_appointment_id TEXT,
    next_due_date TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_appointments_scheduled_at ON appointments(scheduled_at);
  CREATE INDEX IF NOT EXISTS idx_appointments_customer_id ON appointments(customer_id);

  CREATE TABLE IF NOT EXISTS prescriptions (
    id TEXT PRIMARY KEY NOT NULL,
    customer_id TEXT,
    prescriber_name TEXT,
    prescriber_reg_no TEXT,
    diagnosis TEXT,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    sale_id TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS prescription_items (
    id TEXT PRIMARY KEY NOT NULL,
    prescription_id TEXT NOT NULL,
    product_id TEXT,
    drug_name TEXT,
    strength TEXT,
    dose TEXT,
    quantity INTEGER,
    frequency TEXT,
    duration TEXT,
    instructions TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_prescription_items_prescription_id ON prescription_items(prescription_id);

  CREATE TABLE IF NOT EXISTS drug_interactions (
    id TEXT PRIMARY KEY NOT NULL,
    drug_a TEXT NOT NULL,
    drug_b TEXT NOT NULL,
    severity TEXT NOT NULL,
    note TEXT
  );

  CREATE TABLE IF NOT EXISTS drug_catalog (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    strength TEXT,
    dosage_form TEXT,
    base_unit TEXT NOT NULL,
    is_controlled INTEGER NOT NULL DEFAULT 0,
    requires_prescription INTEGER NOT NULL DEFAULT 0,
    category TEXT
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY NOT NULL,
    actor_id TEXT,
    action TEXT NOT NULL,
    entity TEXT,
    entity_id TEXT,
    diff TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS receipt_counters (
    branch_id TEXT NOT NULL,
    date_key TEXT NOT NULL,
    last_seq INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (branch_id, date_key)
  );
`)
