-- PharmaTrack RLS Policies
-- Migration: 002_rls.sql

-- ============================================================
-- HELPER FUNCTIONS (in auth schema to access auth.uid())
-- ============================================================

CREATE OR REPLACE FUNCTION auth.user_organization_id()
RETURNS uuid AS $$
  SELECT organization_id FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION auth.user_branch_id()
RETURNS uuid AS $$
  SELECT branch_id FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION auth.user_role()
RETURNS text AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- ============================================================
-- ENABLE RLS ON ALL TABLES
-- ============================================================

ALTER TABLE public.organizations           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shifts                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_batches         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.controlled_substance_log ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- organizations
-- ============================================================

CREATE POLICY "org_select" ON public.organizations
  FOR SELECT USING (id = auth.user_organization_id());

-- No direct INSERT/UPDATE from client — done via service role

-- ============================================================
-- branches
-- ============================================================

CREATE POLICY "branches_select" ON public.branches
  FOR SELECT USING (organization_id = auth.user_organization_id());

CREATE POLICY "branches_insert" ON public.branches
  FOR INSERT WITH CHECK (
    auth.user_role() IN ('owner','manager')
    AND organization_id = auth.user_organization_id()
  );

CREATE POLICY "branches_update" ON public.branches
  FOR UPDATE USING (
    auth.user_role() IN ('owner','manager')
    AND organization_id = auth.user_organization_id()
  );

-- ============================================================
-- profiles
-- ============================================================

CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT USING (organization_id = auth.user_organization_id());

CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE USING (
    id = auth.uid()
    OR auth.user_role() IN ('owner','manager')
  );

CREATE POLICY "profiles_insert" ON public.profiles
  FOR INSERT WITH CHECK (
    organization_id = auth.user_organization_id()
    AND auth.user_role() IN ('owner','manager')
  );

-- ============================================================
-- shifts
-- ============================================================

CREATE POLICY "shifts_select" ON public.shifts
  FOR SELECT USING (
    staff_id = auth.uid()
    OR auth.user_role() IN ('owner','manager')
  );

CREATE POLICY "shifts_insert" ON public.shifts
  FOR INSERT WITH CHECK (staff_id = auth.uid());

CREATE POLICY "shifts_update" ON public.shifts
  FOR UPDATE USING (
    staff_id = auth.uid()
    OR auth.user_role() IN ('owner','manager')
  );

-- ============================================================
-- categories
-- ============================================================

CREATE POLICY "categories_select" ON public.categories
  FOR SELECT USING (organization_id = auth.user_organization_id());

CREATE POLICY "categories_insert" ON public.categories
  FOR INSERT WITH CHECK (
    organization_id = auth.user_organization_id()
    AND auth.user_role() IN ('owner','manager','pharmacist')
  );

CREATE POLICY "categories_update" ON public.categories
  FOR UPDATE USING (
    organization_id = auth.user_organization_id()
    AND auth.user_role() IN ('owner','manager')
  );

-- ============================================================
-- suppliers
-- ============================================================

CREATE POLICY "suppliers_select" ON public.suppliers
  FOR SELECT USING (organization_id = auth.user_organization_id());

CREATE POLICY "suppliers_insert" ON public.suppliers
  FOR INSERT WITH CHECK (
    organization_id = auth.user_organization_id()
    AND auth.user_role() IN ('owner','manager','pharmacist')
  );

CREATE POLICY "suppliers_update" ON public.suppliers
  FOR UPDATE USING (
    organization_id = auth.user_organization_id()
    AND auth.user_role() IN ('owner','manager')
  );

-- ============================================================
-- products
-- ============================================================

CREATE POLICY "products_select" ON public.products
  FOR SELECT USING (organization_id = auth.user_organization_id());

CREATE POLICY "products_insert" ON public.products
  FOR INSERT WITH CHECK (
    auth.user_role() IN ('owner','manager','pharmacist')
    AND organization_id = auth.user_organization_id()
  );

CREATE POLICY "products_update" ON public.products
  FOR UPDATE USING (
    auth.user_role() IN ('owner','manager','pharmacist')
    AND organization_id = auth.user_organization_id()
  );

CREATE POLICY "products_delete" ON public.products
  FOR DELETE USING (
    auth.user_role() IN ('owner','manager')
    AND organization_id = auth.user_organization_id()
  );

-- ============================================================
-- product_batches
-- ============================================================

CREATE POLICY "batches_select" ON public.product_batches
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_id
        AND p.organization_id = auth.user_organization_id()
    )
  );

CREATE POLICY "batches_insert" ON public.product_batches
  FOR INSERT WITH CHECK (
    auth.user_role() IN ('owner','manager','pharmacist')
    AND EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_id
        AND p.organization_id = auth.user_organization_id()
    )
  );

CREATE POLICY "batches_update" ON public.product_batches
  FOR UPDATE USING (
    auth.user_role() IN ('owner','manager','pharmacist')
    AND EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_id
        AND p.organization_id = auth.user_organization_id()
    )
  );

-- ============================================================
-- sales
-- ============================================================

CREATE POLICY "sales_select" ON public.sales
  FOR SELECT USING (
    branch_id = auth.user_branch_id()
    OR auth.user_role() IN ('owner','manager')
  );

CREATE POLICY "sales_insert" ON public.sales
  FOR INSERT WITH CHECK (
    branch_id = auth.user_branch_id()
    AND auth.user_role() IN ('owner','manager','pharmacist','cashier')
  );

CREATE POLICY "sales_update" ON public.sales
  FOR UPDATE USING (
    auth.user_role() IN ('owner','manager')
  );

-- ============================================================
-- sale_items
-- ============================================================

CREATE POLICY "sale_items_select" ON public.sale_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.sales s
      WHERE s.id = sale_id
        AND (
          s.branch_id = auth.user_branch_id()
          OR auth.user_role() IN ('owner','manager')
        )
    )
  );

CREATE POLICY "sale_items_insert" ON public.sale_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sales s
      WHERE s.id = sale_id
        AND s.branch_id = auth.user_branch_id()
    )
  );

-- ============================================================
-- controlled_substance_log
-- ============================================================

CREATE POLICY "cs_log_select" ON public.controlled_substance_log
  FOR SELECT USING (
    branch_id = auth.user_branch_id()
    OR auth.user_role() IN ('owner','manager')
  );

CREATE POLICY "cs_log_insert" ON public.controlled_substance_log
  FOR INSERT WITH CHECK (
    auth.user_role() IN ('owner','manager','pharmacist','cashier')
    AND branch_id = auth.user_branch_id()
  );
