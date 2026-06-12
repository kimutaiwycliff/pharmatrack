-- PharmaTrack Initial Schema
-- Migration: 001_initial_schema.sql

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- MULTI-TENANCY
-- ============================================================

CREATE TABLE IF NOT EXISTS organizations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL,
  registration_number text,
  phone               text,
  email               text,
  address             text,
  logo_url            text,
  settings            jsonb NOT NULL DEFAULT '{}',
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS branches (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            text NOT NULL,
  address         text,
  phone           text,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- STAFF
-- ============================================================

CREATE TABLE IF NOT EXISTS profiles (
  id              uuid PRIMARY KEY,  -- matches auth.users.id
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  branch_id       uuid REFERENCES branches(id),  -- NULL = all branches
  full_name       text NOT NULL,
  phone           text,
  role            text NOT NULL CHECK (role IN ('owner','manager','pharmacist','cashier')),
  pin_hash        text,  -- bcrypt hash of 4-digit PIN
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shifts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id       uuid NOT NULL REFERENCES branches(id),
  staff_id        uuid NOT NULL REFERENCES profiles(id),
  clocked_in_at   timestamptz NOT NULL,
  clocked_out_at  timestamptz,
  opening_float   numeric(12,2) NOT NULL DEFAULT 0,
  closing_cash    numeric(12,2),
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- PRODUCTS & INVENTORY
-- ============================================================

CREATE TABLE IF NOT EXISTS categories (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS suppliers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            text NOT NULL,
  phone           text,
  email           text,
  address         text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  category_id     uuid REFERENCES categories(id),

  -- Identity
  name            text NOT NULL,
  brand_name      text,
  manufacturer    text,
  gtin            text,         -- GS1 GTIN-13 / EAN-13
  barcode_raw     text,         -- raw barcode if not GS1

  -- Pharmaceutical details
  strength        text,         -- e.g. "500mg", "250mg/5ml"
  dosage_form     text,         -- tablet, capsule, syrup, cream, injection, etc.

  -- Unit of measure hierarchy
  base_unit       text NOT NULL,         -- smallest sellable unit: tablet, ml, g, unit
  pack_label      text,                  -- Box, Bottle, Tube
  units_per_pack  integer NOT NULL DEFAULT 1,

  -- Pricing (in KES)
  cost_price      numeric(12,2),         -- per base unit
  selling_price   numeric(12,2) NOT NULL, -- per base unit

  -- Inventory control
  reorder_level    integer NOT NULL DEFAULT 10,
  reorder_quantity integer NOT NULL DEFAULT 100,

  -- Regulatory
  is_controlled             boolean NOT NULL DEFAULT false,
  requires_prescription     boolean NOT NULL DEFAULT false,

  -- Metadata
  is_active   boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Indexes for fast barcode lookup
CREATE INDEX IF NOT EXISTS idx_products_gtin ON products(gtin) WHERE gtin IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_barcode_raw ON products(barcode_raw) WHERE barcode_raw IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_org ON products(organization_id);

CREATE TABLE IF NOT EXISTS product_batches (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id       uuid NOT NULL REFERENCES products(id),
  branch_id        uuid NOT NULL REFERENCES branches(id),
  supplier_id      uuid REFERENCES suppliers(id),

  batch_number       text NOT NULL,
  expiry_date        date NOT NULL,
  manufactured_date  date,

  quantity_received  integer NOT NULL CHECK (quantity_received > 0),
  quantity_remaining integer NOT NULL CHECK (quantity_remaining >= 0),
  cost_price         numeric(12,2),

  received_at        timestamptz NOT NULL DEFAULT now(),
  received_by        uuid REFERENCES profiles(id),
  purchase_order_id  uuid,  -- future PO table

  notes      text,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_qty_remaining CHECK (quantity_remaining <= quantity_received)
);

CREATE INDEX IF NOT EXISTS idx_batches_product ON product_batches(product_id);
CREATE INDEX IF NOT EXISTS idx_batches_expiry ON product_batches(product_id, expiry_date);

-- Stock view (computed current stock per product per branch)
CREATE OR REPLACE VIEW product_stock AS
SELECT
  p.id                  AS product_id,
  p.organization_id,
  pb.branch_id,
  p.name,
  p.brand_name,
  p.strength,
  p.dosage_form,
  p.base_unit,
  p.pack_label,
  p.units_per_pack,
  p.selling_price,
  p.cost_price,
  p.reorder_level,
  p.is_controlled,
  p.requires_prescription,
  p.gtin,
  p.barcode_raw,
  p.category_id,
  p.is_active,
  COALESCE(SUM(pb.quantity_remaining), 0) AS stock_on_hand,
  MIN(pb.expiry_date)                     AS earliest_expiry,
  COUNT(pb.id)                            AS batch_count
FROM products p
LEFT JOIN product_batches pb
       ON pb.product_id = p.id
      AND pb.quantity_remaining > 0
GROUP BY
  p.id, p.organization_id, pb.branch_id,
  p.name, p.brand_name, p.strength, p.dosage_form,
  p.base_unit, p.pack_label, p.units_per_pack,
  p.selling_price, p.cost_price, p.reorder_level,
  p.is_controlled, p.requires_prescription,
  p.gtin, p.barcode_raw, p.category_id, p.is_active;

-- ============================================================
-- SALES
-- ============================================================

CREATE TABLE IF NOT EXISTS sales (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id   uuid NOT NULL REFERENCES branches(id),
  shift_id    uuid REFERENCES shifts(id),
  cashier_id  uuid NOT NULL REFERENCES profiles(id),

  -- Status
  status      text NOT NULL DEFAULT 'completed'
              CHECK (status IN ('completed','voided','refunded')),

  -- Totals
  subtotal       numeric(12,2) NOT NULL,
  discount_amount numeric(12,2) NOT NULL DEFAULT 0,
  tax_amount     numeric(12,2) NOT NULL DEFAULT 0,
  total_amount   numeric(12,2) NOT NULL,

  -- Payment
  payment_method  text NOT NULL
                  CHECK (payment_method IN ('cash','mpesa','card','credit','split')),
  amount_tendered numeric(12,2),
  change_given    numeric(12,2),
  mpesa_reference text,

  -- Customer (optional)
  customer_name  text,
  customer_phone text,

  -- Metadata
  receipt_number text UNIQUE NOT NULL,
  notes          text,
  voided_at      timestamptz,
  voided_by      uuid REFERENCES profiles(id),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sales_branch_date ON sales(branch_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sales_receipt ON sales(receipt_number);

CREATE TABLE IF NOT EXISTS sale_items (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id    uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id),
  batch_id   uuid REFERENCES product_batches(id),

  -- Snapshots at time of sale
  product_name     text NOT NULL,
  product_strength text,
  base_unit        text NOT NULL,

  quantity         integer NOT NULL CHECK (quantity > 0),
  unit_price       numeric(12,2) NOT NULL,
  discount_percent numeric(5,2) NOT NULL DEFAULT 0,
  line_total       numeric(12,2) NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);

-- ============================================================
-- NARCOTICS REGISTER
-- ============================================================

CREATE TABLE IF NOT EXISTS controlled_substance_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id  uuid NOT NULL REFERENCES branches(id),
  product_id uuid NOT NULL REFERENCES products(id),
  batch_id   uuid NOT NULL REFERENCES product_batches(id),

  transaction_type text NOT NULL
    CHECK (transaction_type IN ('received','dispensed','destroyed','adjusted')),
  quantity      integer NOT NULL,
  balance_after integer NOT NULL,

  sale_id             uuid REFERENCES sales(id),
  patient_name        text,
  prescriber_name     text,
  prescription_number text,

  recorded_by uuid NOT NULL REFERENCES profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- RECEIPT NUMBER GENERATOR
-- ============================================================

CREATE OR REPLACE FUNCTION generate_receipt_number(p_branch_id uuid)
RETURNS text AS $$
DECLARE
  branch_code text;
  today_str   text;
  seq         integer;
BEGIN
  SELECT LEFT(name, 3) INTO branch_code
  FROM branches
  WHERE id = p_branch_id;

  today_str := TO_CHAR(NOW(), 'YYYYMMDD');

  SELECT COUNT(*) + 1 INTO seq
  FROM sales
  WHERE branch_id = p_branch_id
    AND DATE(created_at) = CURRENT_DATE;

  RETURN UPPER(branch_code) || '-' || today_str || '-' || LPAD(seq::text, 4, '0');
END;
$$ LANGUAGE plpgsql;
