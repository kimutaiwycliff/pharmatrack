-- ============================================================
-- 014 — Perf: RLS initplan + tighten product-images bucket
-- ============================================================
-- 1) Wrap per-row auth.uid()/user_role() calls in scalar subqueries so the
--    planner evaluates them once per statement instead of once per row
--    (Supabase "auth_rls_initplan" advisory). Semantically identical for
--    STABLE functions — only the evaluation count changes.
-- 2) Restrict the product-images bucket SELECT policy to authenticated users
--    so anon clients can't list the whole bucket. Public object *downloads*
--    bypass RLS (the bucket is public), so images still render via their URL.

-- ── profiles ────────────────────────────────────────────────
ALTER POLICY profiles_update ON public.profiles
  USING (
    (id = (select auth.uid()))
    OR ((select user_role()) = ANY (ARRAY['owner'::text, 'manager'::text]))
  );

-- ── shifts ──────────────────────────────────────────────────
ALTER POLICY shifts_insert ON public.shifts
  WITH CHECK (staff_id = (select auth.uid()));

ALTER POLICY shifts_select ON public.shifts
  USING (
    (staff_id = (select auth.uid()))
    OR ((select user_role()) = ANY (ARRAY['owner'::text, 'manager'::text]))
  );

ALTER POLICY shifts_update ON public.shifts
  USING (
    (staff_id = (select auth.uid()))
    OR ((select user_role()) = ANY (ARRAY['owner'::text, 'manager'::text]))
  );

-- ── product_pack_sizes ──────────────────────────────────────
ALTER POLICY pack_sizes_select ON public.product_pack_sizes
  USING (
    EXISTS (
      SELECT 1
      FROM products p
      JOIN profiles pr ON pr.organization_id = p.organization_id
      WHERE p.id = product_pack_sizes.product_id
        AND pr.id = (select auth.uid())
    )
  );

ALTER POLICY pack_sizes_write ON public.product_pack_sizes
  USING (
    EXISTS (
      SELECT 1
      FROM products p
      JOIN profiles pr ON pr.organization_id = p.organization_id
      WHERE p.id = product_pack_sizes.product_id
        AND pr.id = (select auth.uid())
        AND pr.role = ANY (ARRAY['owner'::text, 'manager'::text, 'pharmacist'::text])
    )
  );

-- ── storage: product-images bucket ──────────────────────────
-- Replace the anon-readable listing policy with an authenticated-only one.
DROP POLICY IF EXISTS product_images_public_read ON storage.objects;

CREATE POLICY product_images_auth_read ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'product-images'
    AND (select auth.role()) = 'authenticated'
  );
