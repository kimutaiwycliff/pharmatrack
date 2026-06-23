-- migrate:up
-- Trigram search indexes. pg_trgm lets a GIN index accelerate ILIKE '%q%'
-- substring search (which a btree can't, due to the leading wildcard) and
-- enables typo-tolerant matching via the % operator / similarity(). Covers the
-- app's main searches: product name/brand, customer name/phone, supplier name.
-- pg_trgm is a "trusted" extension, so app_owner can install it.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS product_name_trgm_idx   ON product  USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS product_brand_trgm_idx  ON product  USING gin (brand_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS customer_name_trgm_idx  ON customer USING gin (full_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS customer_phone_trgm_idx ON customer USING gin (phone gin_trgm_ops);
CREATE INDEX IF NOT EXISTS supplier_name_trgm_idx  ON supplier USING gin (name gin_trgm_ops);

-- migrate:down
DROP INDEX IF EXISTS product_name_trgm_idx;
DROP INDEX IF EXISTS product_brand_trgm_idx;
DROP INDEX IF EXISTS customer_name_trgm_idx;
DROP INDEX IF EXISTS customer_phone_trgm_idx;
DROP INDEX IF EXISTS supplier_name_trgm_idx;
-- Leave the pg_trgm extension in place; other objects may rely on it.
