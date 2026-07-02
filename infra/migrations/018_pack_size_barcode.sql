-- migrate:up
-- product_pack_size never carried its own barcode/active-state columns in the
-- rebuilt schema, but the UI (EditProductSheet) already has inputs for both —
-- they were silently discarded on save. A box-of-100 and a strip-of-10 of the
-- same drug legitimately carry different barcodes, so this belongs per pack
-- size, not just on product.gtin.
ALTER TABLE product_pack_size ADD COLUMN barcode text;
ALTER TABLE product_pack_size ADD COLUMN is_active boolean NOT NULL DEFAULT true;

CREATE INDEX idx_pack_size_barcode ON product_pack_size (barcode) WHERE barcode IS NOT NULL;

-- migrate:down
DROP INDEX IF EXISTS idx_pack_size_barcode;
ALTER TABLE product_pack_size DROP COLUMN is_active;
ALTER TABLE product_pack_size DROP COLUMN barcode;
