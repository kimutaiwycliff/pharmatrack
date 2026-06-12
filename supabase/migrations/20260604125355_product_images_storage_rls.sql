-- ============================================================
-- product-images storage bucket + RLS
-- ============================================================
-- Reconstructed during migration-history reconciliation (originally applied
-- directly, never committed). Creates the public product-images bucket and its
-- object policies. NOTE: the public-read policy created here is later replaced
-- by an authenticated-only one in 20260612120545_perf_rls_initplan_and_bucket
-- — this file reflects the original state at this point in history.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images', 'product-images', true, 5242880,
  ARRAY['image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY product_images_public_read ON storage.objects
  FOR SELECT USING (bucket_id = 'product-images');

CREATE POLICY product_images_auth_insert ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'product-images' AND auth.role() = 'authenticated'
  );

CREATE POLICY product_images_auth_delete ON storage.objects
  FOR DELETE USING (
    bucket_id = 'product-images' AND auth.role() = 'authenticated'
  );
