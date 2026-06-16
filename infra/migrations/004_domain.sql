-- migrate:up
-- Catalogue, inventory, sales, clinical, audit. All tenant tables are org-scoped
-- via public.user_organization_id() (GUC). Global reference tables are read-all.
-- Money is numeric(12,2) in DB (ADR-008). No FORCE RLS (app_owner bypasses;
-- app_authenticated enforced).

-- ── Catalogue ────────────────────────────────────────────────────────────────
CREATE TABLE category (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  parent_id       uuid REFERENCES category(id) ON DELETE SET NULL,
  name            text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_category_org ON category(organization_id);

CREATE TABLE supplier (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  name            text NOT NULL,
  phone           text,
  email           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_supplier_org ON supplier(organization_id);

-- Global reference catalogue (no org).
CREATE TABLE drug_catalog (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  text NOT NULL,
  brand_name            text,
  manufacturer          text,
  gtin                  text,
  strength              text,
  dosage_form           text,
  base_unit             text NOT NULL DEFAULT 'tablet',
  is_controlled         boolean NOT NULL DEFAULT false,
  requires_prescription boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_drug_catalog UNIQUE NULLS NOT DISTINCT (name, strength, dosage_form)
);

CREATE TABLE drug_interaction (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drug_a      text NOT NULL,
  drug_b      text NOT NULL,
  severity    text NOT NULL CHECK (severity IN ('contraindicated','major','moderate','minor')),
  note        text
);

CREATE TABLE product (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  catalog_id            uuid REFERENCES drug_catalog(id),
  category_id           uuid REFERENCES category(id),
  supplier_id           uuid REFERENCES supplier(id),
  name                  text NOT NULL,
  brand_name            text,
  manufacturer          text,
  gtin                  text,
  barcode_raw           text,
  strength              text,
  dosage_form           text,
  base_unit             text NOT NULL DEFAULT 'unit',
  pack_label            text,
  units_per_pack        integer NOT NULL DEFAULT 1,
  cost_price            numeric(12,2),
  selling_price         numeric(12,2) NOT NULL DEFAULT 0,
  reorder_level         integer NOT NULL DEFAULT 10,
  max_discount_percent  numeric(5,2),
  is_controlled         boolean NOT NULL DEFAULT false,
  requires_prescription boolean NOT NULL DEFAULT false,
  image_url             text,
  is_active             boolean NOT NULL DEFAULT true,
  created_by            text REFERENCES "user"("id"),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_product_org ON product(organization_id);
CREATE INDEX idx_product_gtin ON product(gtin) WHERE gtin IS NOT NULL;

CREATE TABLE product_pack_size (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    uuid NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  label         text NOT NULL,
  unit_count    integer NOT NULL DEFAULT 1,
  selling_price numeric(12,2) NOT NULL,
  cost_price    numeric(12,2)
);
CREATE INDEX idx_pack_size_product ON product_pack_size(product_id);

-- ── Inventory ────────────────────────────────────────────────────────────────
CREATE TABLE product_batch (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  product_id         uuid NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  branch_id          uuid NOT NULL REFERENCES branch(id),
  supplier_id        uuid REFERENCES supplier(id),
  batch_number       text NOT NULL,
  expiry_date        date NOT NULL,
  quantity_received  integer NOT NULL,
  quantity_remaining integer NOT NULL,
  cost_price         numeric(12,2),
  received_by        text REFERENCES "user"("id"),
  received_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_batch_product ON product_batch(product_id);
CREATE INDEX idx_batch_branch ON product_batch(branch_id);
CREATE INDEX idx_batch_fefo ON product_batch(product_id, expiry_date);

CREATE TABLE stock_adjustment (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  batch_id        uuid NOT NULL REFERENCES product_batch(id),
  reason          text NOT NULL CHECK (reason IN ('count_correction','damage','expiry','theft_loss','return','other')),
  delta           integer NOT NULL,
  quantity_before integer NOT NULL,
  quantity_after  integer NOT NULL,
  note            text,
  adjusted_by     text REFERENCES "user"("id"),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_stock_adj_org ON stock_adjustment(organization_id);

CREATE TABLE controlled_substance_log (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  sale_item_id       uuid,
  pharmacist_name    text,
  pharmacist_reg     text,
  prescriber_name    text,
  prescriber_reg     text,
  patient_id         text,
  quantity           integer NOT NULL,
  batch_number       text,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_csl_org ON controlled_substance_log(organization_id);

-- ── Sales ────────────────────────────────────────────────────────────────────
CREATE TABLE shift (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  branch_id       uuid NOT NULL REFERENCES branch(id),
  cashier_id      text NOT NULL REFERENCES "user"("id"),
  opening_float   numeric(12,2) NOT NULL DEFAULT 0,
  closing_cash    numeric(12,2),
  variance        numeric(12,2),
  opened_at       timestamptz NOT NULL DEFAULT now(),
  closed_at       timestamptz
);
CREATE INDEX idx_shift_org ON shift(organization_id);

CREATE TABLE sale (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  branch_id         uuid NOT NULL REFERENCES branch(id),
  shift_id          uuid REFERENCES shift(id),
  cashier_id        text REFERENCES "user"("id"),
  receipt_number    text,
  status            text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','voided','refunded')),
  subtotal          numeric(12,2) NOT NULL DEFAULT 0,
  discount_amount   numeric(12,2) NOT NULL DEFAULT 0,
  tax_amount        numeric(12,2) NOT NULL DEFAULT 0,
  total_amount      numeric(12,2) NOT NULL DEFAULT 0,
  payment_method    text NOT NULL CHECK (payment_method IN ('cash','mpesa','card','split')),
  offline_reference text UNIQUE,
  customer_id       uuid,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sale_org ON sale(organization_id);
CREATE INDEX idx_sale_branch_date ON sale(branch_id, created_at);

CREATE TABLE sale_item (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id          uuid NOT NULL REFERENCES sale(id) ON DELETE CASCADE,
  product_id       uuid REFERENCES product(id),
  batch_id         uuid REFERENCES product_batch(id),
  product_name     text NOT NULL,
  quantity         integer NOT NULL,
  unit_price       numeric(12,2) NOT NULL,
  discount_percent numeric(5,2) NOT NULL DEFAULT 0,
  line_total       numeric(12,2) NOT NULL
);
CREATE INDEX idx_sale_item_sale ON sale_item(sale_id);

CREATE TABLE payment (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id             uuid NOT NULL REFERENCES sale(id) ON DELETE CASCADE,
  method              text NOT NULL CHECK (method IN ('cash','mpesa','card')),
  amount              numeric(12,2) NOT NULL,
  mpesa_checkout_id   text,
  mpesa_receipt       text,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_payment_sale ON payment(sale_id);

-- ── Clinical ─────────────────────────────────────────────────────────────────
CREATE TABLE customer (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  full_name       text NOT NULL,
  phone           text,
  allergies       text,
  reminder_opt_in boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_customer_org ON customer(organization_id);

CREATE TABLE appointment_service (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  slug            text NOT NULL,
  label           text NOT NULL,
  recurrence_weeks integer,
  sort_order      integer NOT NULL DEFAULT 0
);
CREATE INDEX idx_appt_service_org ON appointment_service(organization_id);

CREATE TABLE appointment (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  customer_id     uuid NOT NULL REFERENCES customer(id),
  service_id      uuid REFERENCES appointment_service(id),
  scheduled_at    timestamptz NOT NULL,
  status          text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','completed','missed','cancelled')),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_appt_org ON appointment(organization_id);

CREATE TABLE appointment_reminder (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  appointment_id  uuid NOT NULL REFERENCES appointment(id) ON DELETE CASCADE,
  channel         text NOT NULL CHECK (channel IN ('email','sms','whatsapp')),
  status          text NOT NULL DEFAULT 'pending',
  send_at         timestamptz NOT NULL,
  sent_at         timestamptz,
  error           text
);
CREATE INDEX idx_appt_reminder_org ON appointment_reminder(organization_id);

CREATE TABLE prescription (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  customer_id     uuid REFERENCES customer(id),
  prescriber      text,
  sale_id         uuid REFERENCES sale(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_prescription_org ON prescription(organization_id);

CREATE TABLE prescription_item (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id uuid NOT NULL REFERENCES prescription(id) ON DELETE CASCADE,
  drug            text NOT NULL,
  strength        text,
  quantity        integer,
  frequency       text
);
CREATE INDEX idx_prescription_item_rx ON prescription_item(prescription_id);

-- ── Audit ────────────────────────────────────────────────────────────────────
CREATE TABLE audit_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text REFERENCES "organization"("id") ON DELETE CASCADE,
  actor_id        text REFERENCES "user"("id"),
  action          text NOT NULL,
  entity          text,
  entity_id       text,
  diff            jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_org ON audit_log(organization_id);

-- ── product_stock view (security_invoker => underlying RLS applies) ──────────
CREATE VIEW product_stock WITH (security_invoker = true) AS
SELECT
  p.id AS product_id, p.organization_id, pb.branch_id,
  p.name, p.brand_name, p.strength, p.dosage_form, p.base_unit, p.pack_label,
  p.units_per_pack, p.selling_price, p.cost_price, p.reorder_level,
  p.is_controlled, p.requires_prescription, p.gtin, p.barcode_raw,
  p.category_id, p.is_active, p.image_url, p.max_discount_percent, p.catalog_id,
  COALESCE(SUM(pb.quantity_remaining) FILTER (WHERE pb.quantity_remaining > 0), 0)::int AS stock_on_hand,
  MIN(pb.expiry_date) FILTER (WHERE pb.quantity_remaining > 0) AS earliest_expiry,
  COUNT(pb.id) FILTER (WHERE pb.quantity_remaining > 0)::int AS batch_count
FROM product p
LEFT JOIN product_batch pb ON pb.product_id = p.id
GROUP BY p.id, pb.branch_id;

-- ── RLS: org-scoped FOR ALL on tenant tables; read-all on globals ────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'category','supplier','product','product_batch','stock_adjustment',
    'controlled_substance_log','shift','sale','customer','appointment_service',
    'appointment','appointment_reminder','prescription','audit_log'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %1$s_rls ON %1$I FOR ALL USING (organization_id = public.user_organization_id()) WITH CHECK (organization_id = public.user_organization_id())',
      t);
  END LOOP;
END $$;

-- Child tables scoped through their parent's org (no own organization_id).
ALTER TABLE product_pack_size ENABLE ROW LEVEL SECURITY;
CREATE POLICY pack_rls ON product_pack_size FOR ALL
  USING (product_id IN (SELECT id FROM product WHERE organization_id = public.user_organization_id()))
  WITH CHECK (product_id IN (SELECT id FROM product WHERE organization_id = public.user_organization_id()));

ALTER TABLE sale_item ENABLE ROW LEVEL SECURITY;
CREATE POLICY sale_item_rls ON sale_item FOR ALL
  USING (sale_id IN (SELECT id FROM sale WHERE organization_id = public.user_organization_id()))
  WITH CHECK (sale_id IN (SELECT id FROM sale WHERE organization_id = public.user_organization_id()));

ALTER TABLE payment ENABLE ROW LEVEL SECURITY;
CREATE POLICY payment_rls ON payment FOR ALL
  USING (sale_id IN (SELECT id FROM sale WHERE organization_id = public.user_organization_id()))
  WITH CHECK (sale_id IN (SELECT id FROM sale WHERE organization_id = public.user_organization_id()));

ALTER TABLE prescription_item ENABLE ROW LEVEL SECURITY;
CREATE POLICY rx_item_rls ON prescription_item FOR ALL
  USING (prescription_id IN (SELECT id FROM prescription WHERE organization_id = public.user_organization_id()))
  WITH CHECK (prescription_id IN (SELECT id FROM prescription WHERE organization_id = public.user_organization_id()));

-- Global reference tables: any authenticated user reads.
ALTER TABLE drug_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY drug_catalog_read ON drug_catalog FOR SELECT USING (true);
ALTER TABLE drug_interaction ENABLE ROW LEVEL SECURITY;
CREATE POLICY drug_interaction_read ON drug_interaction FOR SELECT USING (true);

-- migrate:down
DROP VIEW IF EXISTS product_stock;
DROP TABLE IF EXISTS audit_log, prescription_item, prescription, appointment_reminder,
  appointment, appointment_service, customer, payment, sale_item, sale, shift,
  controlled_substance_log, stock_adjustment, product_batch, product_pack_size,
  product, drug_interaction, drug_catalog, supplier, category CASCADE;
