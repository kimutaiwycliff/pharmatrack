-- migrate:up
-- ADR-021 — Cashier station, a paid add-on. Order desks send orders; one
-- cashier takes the money and hands the goods over. Everything here is
-- additive: new tables, and new columns that are null or keep today's
-- behaviour (cashier_station_enabled = false), so tenants without the add-on
-- are untouched.

-- Add-on catalogue (operator-managed, like plan) and what each tenant has.
-- Billed flat per tenant per month, however many branches switch it on.
CREATE TABLE addon (
  code            text PRIMARY KEY,
  name            text NOT NULL,
  price_kes_month numeric(12,2) NOT NULL,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);
INSERT INTO addon (code, name, price_kes_month) VALUES
  ('cashier_station', 'Cashier station', 1500)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE org_addon (
  organization_id text NOT NULL REFERENCES "organization"(id) ON DELETE CASCADE,
  addon_code      text NOT NULL REFERENCES addon(code),
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
  activated_at    timestamptz NOT NULL DEFAULT now(),
  cancelled_at    timestamptz,
  granted_by      text,                 -- operator, when comped or paid by hand
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, addon_code)
);

-- Per-branch switch. The add-on is paid per tenant but turned on per branch.
ALTER TABLE branch
  ADD COLUMN cashier_station_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN order_hold_minutes      integer NOT NULL DEFAULT 30
                                     CHECK (order_hold_minutes BETWEEN 5 AND 240),
  -- May order-desk staff still check out directly while the station is on?
  ADD COLUMN order_desk_direct_sale  boolean NOT NULL DEFAULT false;

-- An order waiting for the cashier. Not a sale until it is paid: collecting
-- it creates the sale (sale.counter_order_id) through the till's own code.
-- While awaiting_payment and before expires_at, its lines hold stock.
CREATE TABLE counter_order (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  text NOT NULL REFERENCES "organization"(id) ON DELETE CASCADE,
  branch_id        uuid NOT NULL REFERENCES branch(id) ON DELETE CASCADE,
  business_date    date NOT NULL,                  -- Africa/Nairobi day
  number           integer NOT NULL,               -- shown as A-047
  status           text NOT NULL DEFAULT 'awaiting_payment'
                   CHECK (status IN ('awaiting_payment', 'paid', 'cancelled', 'expired')),
  sent_by          text REFERENCES "user"(id) ON DELETE SET NULL,  -- set on send; null only if the user is deleted
  collected_by     text REFERENCES "user"(id) ON DELETE SET NULL,
  cancelled_by     text REFERENCES "user"(id) ON DELETE SET NULL,
  sale_id          uuid REFERENCES sale(id) ON DELETE SET NULL,
  subtotal         numeric(12,2) NOT NULL,
  discount_amount  numeric(12,2) NOT NULL DEFAULT 0,
  total_amount     numeric(12,2) NOT NULL,
  customer_name    text,
  customer_phone   text,
  client_reference text UNIQUE,                    -- idempotent "send" retries
  expires_at       timestamptz NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (branch_id, business_date, number)
);
CREATE INDEX idx_counter_order_queue ON counter_order (branch_id, status, expires_at);

CREATE TABLE counter_order_item (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         uuid NOT NULL REFERENCES counter_order(id) ON DELETE CASCADE,
  organization_id  text NOT NULL REFERENCES "organization"(id) ON DELETE CASCADE,
  -- Like purchase_order_item: deleting a product (or purging the tenant) keeps
  -- the line by name. A line without a product can't be collected.
  product_id       uuid REFERENCES product(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  product_name     text NOT NULL,
  product_strength text,
  base_unit        text NOT NULL,
  is_controlled    boolean NOT NULL DEFAULT false,
  quantity         integer NOT NULL CHECK (quantity > 0),  -- base units held
  pack_size_id     uuid REFERENCES product_pack_size(id) ON DELETE SET NULL,
  unit_count       integer,
  unit_price       numeric(12,2) NOT NULL,          -- per base unit, locked at send
  discount_percent numeric(5,2) NOT NULL DEFAULT 0,
  line_total       numeric(12,2) NOT NULL,
  removed_at       timestamptz,                     -- the cashier took it off
  removed_by       text REFERENCES "user"(id) ON DELETE SET NULL
);
CREATE INDEX idx_counter_order_item_order ON counter_order_item (order_id);
CREATE INDEX idx_counter_order_item_product ON counter_order_item (product_id);

-- Who served (order desk) vs who took the money (sale.cashier_id).
ALTER TABLE sale
  ADD COLUMN counter_order_id uuid REFERENCES counter_order(id) ON DELETE SET NULL,
  ADD COLUMN sold_by          text REFERENCES "user"(id) ON DELETE SET NULL;

-- Card approval code (card is taken at the cashier station only).
ALTER TABLE payment ADD COLUMN reference text;

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE addon              ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_addon          ENABLE ROW LEVEL SECURITY;
ALTER TABLE counter_order      ENABLE ROW LEVEL SECURITY;
ALTER TABLE counter_order_item ENABLE ROW LEVEL SECURITY;

-- Catalogue is readable by any signed-in user; writes via app_owner only.
CREATE POLICY addon_read ON addon FOR SELECT USING (true);
-- A tenant reads its own add-ons; only app_owner (billing webhook, operator
-- console) can grant, cancel or change them — no write policy here.
CREATE POLICY org_addon_read ON org_addon FOR SELECT
  USING (organization_id = public.user_organization_id());

CREATE POLICY counter_order_rls ON counter_order FOR ALL
  USING (organization_id = public.user_organization_id())
  WITH CHECK (organization_id = public.user_organization_id());
CREATE POLICY counter_order_item_rls ON counter_order_item FOR ALL
  USING (organization_id = public.user_organization_id())
  WITH CHECK (organization_id = public.user_organization_id());

-- migrate:down
ALTER TABLE payment DROP COLUMN IF EXISTS reference;
ALTER TABLE sale
  DROP COLUMN IF EXISTS sold_by,
  DROP COLUMN IF EXISTS counter_order_id;
DROP TABLE IF EXISTS counter_order_item;
DROP TABLE IF EXISTS counter_order;
ALTER TABLE branch
  DROP COLUMN IF EXISTS order_desk_direct_sale,
  DROP COLUMN IF EXISTS order_hold_minutes,
  DROP COLUMN IF EXISTS cashier_station_enabled;
DROP TABLE IF EXISTS org_addon;
DROP TABLE IF EXISTS addon;
