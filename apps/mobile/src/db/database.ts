import { openDatabaseSync } from "expo-sqlite"
import { drizzle } from "drizzle-orm/expo-sqlite"
import * as schema from "./schema"

const sqliteDb = openDatabaseSync("pharmatrack.db")

export const db = drizzle(sqliteDb, { schema })

// Create tables on first run. No migration framework needed for a schema this
// small (two tables, no relations) — if a column is added later, bump this to
// a real migration rather than editing the CREATE TABLE below in place.
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
`)
