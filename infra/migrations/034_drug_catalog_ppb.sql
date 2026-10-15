-- migrate:up
-- Shared drug catalogue, part 2: room for the Pharmacy and Poisons Board
-- register (packages/db/data/ppb, loaded by 035) next to the hand-curated
-- rows, plus fuzzy search.
--  * source: 'curated' (the priced Kenyan retail list — Quick Start seeds only
--    these) or 'ppb' (registered medicines — search/autofill only; staff
--    review each one as they add it).
--  * ppb_*: the register's own fields, kept for traceability and refreshes.

ALTER TABLE drug_catalog
  ADD COLUMN source                  text NOT NULL DEFAULT 'curated' CHECK (source IN ('curated', 'ppb')),
  ADD COLUMN ppb_registration_no     text,
  ADD COLUMN inn                     text,
  ADD COLUMN mah                     text,
  ADD COLUMN country_of_origin       text,
  ADD COLUMN ppb_registration_expiry date;

CREATE UNIQUE INDEX drug_catalog_ppb_reg_uidx ON drug_catalog (ppb_registration_no) WHERE ppb_registration_no IS NOT NULL;

-- Typo-tolerant, ranked catalogue search (pg_trgm installed by 012).
CREATE INDEX IF NOT EXISTS drug_catalog_name_trgm_idx    ON drug_catalog USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS drug_catalog_brand_trgm_idx   ON drug_catalog USING gin (brand_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS drug_catalog_generic_trgm_idx ON drug_catalog USING gin (generic_name gin_trgm_ops);

-- migrate:down
DROP INDEX IF EXISTS drug_catalog_generic_trgm_idx;
DROP INDEX IF EXISTS drug_catalog_brand_trgm_idx;
DROP INDEX IF EXISTS drug_catalog_name_trgm_idx;
DROP INDEX IF EXISTS drug_catalog_ppb_reg_uidx;
ALTER TABLE drug_catalog
  DROP COLUMN IF EXISTS ppb_registration_expiry,
  DROP COLUMN IF EXISTS country_of_origin,
  DROP COLUMN IF EXISTS mah,
  DROP COLUMN IF EXISTS inn,
  DROP COLUMN IF EXISTS ppb_registration_no,
  DROP COLUMN IF EXISTS source;
