-- ============================================================
-- product columns + pack sizes
-- ============================================================
-- Reconstructed into the repo during migration-history reconciliation: this
-- was originally applied directly to the database and never committed. Content
-- is idempotent and reproduces the live schema. Adds image_url /
-- max_discount_percent to products and the product_pack_sizes table (alternate
-- sellable pack units with their own barcode/price).

ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS max_discount_percent numeric(5,2);

CREATE TABLE IF NOT EXISTS product_pack_sizes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id     uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  pack_label     text NOT NULL,
  units_per_pack integer NOT NULL CHECK (units_per_pack > 0),
  selling_price  numeric(12,2) NOT NULL CHECK (selling_price > 0),
  barcode        text,
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pack_sizes_product ON product_pack_sizes(product_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pack_sizes_barcode
  ON product_pack_sizes(barcode) WHERE barcode IS NOT NULL;

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE public.product_pack_sizes ENABLE ROW LEVEL SECURITY;

CREATE POLICY pack_sizes_select ON public.product_pack_sizes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM products p
      JOIN profiles pr ON pr.organization_id = p.organization_id
      WHERE p.id = product_pack_sizes.product_id AND pr.id = auth.uid()
    )
  );

CREATE POLICY pack_sizes_write ON public.product_pack_sizes
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM products p
      JOIN profiles pr ON pr.organization_id = p.organization_id
      WHERE p.id = product_pack_sizes.product_id
        AND pr.id = auth.uid()
        AND pr.role = ANY (ARRAY['owner','manager','pharmacist'])
    )
  );
