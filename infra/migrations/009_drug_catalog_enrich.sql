-- migrate:up
-- Enrich drug_catalog so the onboarding seed can pre-fill department, pricing and
-- pack info — not just drug identity. Powers the Quick Start flow: a tenant picks
-- departments, products are created active + priced, and they tune in a grid.
--
-- Pricing convention: default_selling_price / default_cost_price are PER BASE
-- UNIT (per tablet / capsule / bottle / tube / piece), matching how the POS cart
-- prices a line (unit_price * quantity). default_units_per_pack + the label are
-- the typical retail pack, used for opening-stock entry and a pack SKU later.

ALTER TABLE drug_catalog
  ADD COLUMN IF NOT EXISTS category              text,
  ADD COLUMN IF NOT EXISTS subcategory           text,
  ADD COLUMN IF NOT EXISTS is_otc                boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS therapeutic_class     text,
  ADD COLUMN IF NOT EXISTS default_pack_label    text,
  ADD COLUMN IF NOT EXISTS default_units_per_pack integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS default_cost_price    numeric(12,2),
  ADD COLUMN IF NOT EXISTS default_selling_price numeric(12,2),
  ADD COLUMN IF NOT EXISTS image_url             text;

-- Browse the catalogue by department in the seed UI.
CREATE INDEX IF NOT EXISTS drug_catalog_category_idx ON drug_catalog (category);

-- migrate:down
DROP INDEX IF EXISTS drug_catalog_category_idx;
ALTER TABLE drug_catalog
  DROP COLUMN IF EXISTS category,
  DROP COLUMN IF EXISTS subcategory,
  DROP COLUMN IF EXISTS is_otc,
  DROP COLUMN IF EXISTS therapeutic_class,
  DROP COLUMN IF EXISTS default_pack_label,
  DROP COLUMN IF EXISTS default_units_per_pack,
  DROP COLUMN IF EXISTS default_cost_price,
  DROP COLUMN IF EXISTS default_selling_price,
  DROP COLUMN IF EXISTS image_url;
