-- migrate:up
-- Default product categories (packages/core/src/catalog/taxonomy.ts). A
-- pharmacy's own categories are never touched: a default category/subcategory
-- is created in its `category` table only the first time one of its products
-- uses it, and tagged with the default's key ("pain-fever/gout", or
-- "pain-fever" for the top level). The key survives renames, so suggestions
-- keep landing in the owner's renamed category instead of recreating it.
ALTER TABLE category ADD COLUMN default_key text;

CREATE UNIQUE INDEX category_org_default_key_uidx ON category (organization_id, default_key) WHERE default_key IS NOT NULL;

-- migrate:down
DROP INDEX IF EXISTS category_org_default_key_uidx;
ALTER TABLE category DROP COLUMN IF EXISTS default_key;
