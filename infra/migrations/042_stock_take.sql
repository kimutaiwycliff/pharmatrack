-- migrate:up
-- Stock take, shelf by shelf (ADR-020). A saved counting session for one shelf
-- (a pharmacy category, or a default taxonomy department/subcategory before
-- the pharmacy has products) and the lines counted in it.

CREATE TABLE stock_count (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    text NOT NULL REFERENCES "organization"(id) ON DELETE CASCADE,
  branch_id          uuid NOT NULL REFERENCES branch(id) ON DELETE CASCADE,
  kind               text NOT NULL CHECK (kind IN ('count', 'setup')),
  scope_category_id  uuid REFERENCES category(id) ON DELETE SET NULL,  -- the pharmacy's shelf
  scope_key          text,                                             -- default taxonomy key ("pain-fever" / "pain-fever/gout")
  title              text NOT NULL,
  hide_expected      boolean NOT NULL DEFAULT false,
  status             text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'posted', 'cancelled')),
  created_by         text REFERENCES "user"(id) ON DELETE SET NULL,
  submitted_by       text REFERENCES "user"(id) ON DELETE SET NULL,
  submitted_at       timestamptz,
  posted_by          text REFERENCES "user"(id) ON DELETE SET NULL,
  posted_at          timestamptz,
  totals             jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_stock_count_org_branch_status ON stock_count (organization_id, branch_id, status, updated_at DESC);

-- One counted batch (or a batch found that the system didn't know, or a
-- catalogue product found on the shelf during setup). `id` comes from the
-- client so a retried autosave is an upsert. `expected_qty` is set by the
-- server when `counted_qty` is entered, never by the client.
CREATE TABLE stock_count_line (
  id               uuid PRIMARY KEY,
  organization_id  text NOT NULL REFERENCES "organization"(id) ON DELETE CASCADE,
  count_id         uuid NOT NULL REFERENCES stock_count(id) ON DELETE CASCADE,
  product_id       uuid REFERENCES product(id) ON DELETE CASCADE,
  catalog_id       uuid REFERENCES drug_catalog(id),
  batch_id         uuid REFERENCES product_batch(id) ON DELETE SET NULL,
  batch_number     text,
  expiry_date      date,
  barcode          text,                                             -- scanned on the shelf; saved on the product when posted
  expected_qty     integer,
  counted_qty      integer NOT NULL CHECK (counted_qty >= 0),
  selling_price    numeric(12,2),
  cost_price       numeric(12,2),
  price_confirmed  boolean NOT NULL DEFAULT false,
  counted_by       text REFERENCES "user"(id) ON DELETE SET NULL,
  counted_at       timestamptz NOT NULL DEFAULT now(),
  result           jsonb,
  CHECK (product_id IS NOT NULL OR catalog_id IS NOT NULL),
  CHECK (batch_id IS NOT NULL OR expiry_date IS NOT NULL)
);
CREATE INDEX idx_stock_count_line_count ON stock_count_line (count_id);
CREATE UNIQUE INDEX uq_stock_count_line_batch ON stock_count_line (count_id, batch_id) WHERE batch_id IS NOT NULL;

ALTER TABLE stock_count ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_count_line ENABLE ROW LEVEL SECURITY;
CREATE POLICY stock_count_rls ON stock_count FOR ALL
  USING (organization_id = public.user_organization_id())
  WITH CHECK (organization_id = public.user_organization_id());
CREATE POLICY stock_count_line_rls ON stock_count_line FOR ALL
  USING (organization_id = public.user_organization_id())
  WITH CHECK (organization_id = public.user_organization_id());

-- migrate:down
DROP TABLE IF EXISTS stock_count_line;
DROP TABLE IF EXISTS stock_count;
