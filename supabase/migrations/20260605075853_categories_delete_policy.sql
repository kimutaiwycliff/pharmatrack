-- PharmaTrack — allow categories to be deleted by owners/managers
-- Migration: 004_categories_delete_policy.sql
--
-- The original RLS set (002) defined SELECT/INSERT/UPDATE for categories but no
-- DELETE policy, so deletes were denied. Category management (rename/delete) is
-- an owner/manager action; inline creation during product entry remains open to
-- pharmacists via the existing INSERT policy.
--
-- NOTE: the deployed RLS helpers live in the public schema
-- (public.user_organization_id(), public.user_role()).

DROP POLICY IF EXISTS "categories_delete" ON public.categories;
CREATE POLICY "categories_delete" ON public.categories
  FOR DELETE USING (
    organization_id = public.user_organization_id()
    AND public.user_role() IN ('owner','manager')
  );
