-- ============================================================
-- 015 — Security: pin function search_path (pre-prod hardening)
-- ============================================================
-- Supabase "function_search_path_mutable" advisory. A SECURITY DEFINER
-- function with a caller-controlled search_path is a privilege-escalation
-- vector. Pinning it closes that. ALTER FUNCTION only changes how names
-- resolve *inside* the body — RLS calls to these helpers are unaffected.
--
-- The five SECURITY DEFINER helpers already fully-qualify every reference
-- (public.profiles / public.platform_admins / public.subscriptions /
-- auth.uid()), so an empty search_path is safe. generate_receipt_number is
-- not SECURITY DEFINER and references branches/sales unqualified, so it gets
-- search_path = public (behaviour-identical).

ALTER FUNCTION public.user_organization_id()      SET search_path = '';
ALTER FUNCTION public.user_branch_id()            SET search_path = '';
ALTER FUNCTION public.user_role()                 SET search_path = '';
ALTER FUNCTION public.is_platform_admin()         SET search_path = '';
ALTER FUNCTION public.org_access_allowed(uuid)    SET search_path = '';
ALTER FUNCTION public.generate_receipt_number(uuid) SET search_path = public;
