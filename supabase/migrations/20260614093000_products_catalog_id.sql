-- Tags products that were materialised from the shared drug_catalog, so they
-- can be bulk-removed ("unseed") and never double-seeded.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS catalog_id uuid REFERENCES public.drug_catalog(id);

CREATE INDEX IF NOT EXISTS idx_products_catalog_id
  ON public.products(catalog_id) WHERE catalog_id IS NOT NULL;
