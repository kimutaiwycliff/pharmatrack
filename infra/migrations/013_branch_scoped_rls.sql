-- migrate:up
-- ============================================================================
-- Branch-scoped RLS — hard-lock branch-restricted roles (cashier/pharmacist) to
-- a single branch at the DB layer, on top of the existing org isolation.
--
-- How it works: withTenant() sets `app.branch_id` ONLY for branch-locked roles.
-- owner/manager run with it UNSET and stay org-wide (they get the branch
-- switcher). The predicate below is therefore:
--     branch_id IS visible  ⟺  app.branch_id is unset (org-wide caller)
--                              OR the row's branch = app.branch_id
-- So a cashier's session — which always has app.branch_id pinned (to their
-- branch, or the all-zero sentinel when unassigned → sees nothing) — can never
-- read or write another branch's sales, shifts, batches, or stock.
--
-- Tables covered: branch (read), sale, shift, product_batch directly;
-- stock_adjustment, sale_item, payment via their parent's branch. The product
-- catalogue and customers stay org-wide (shared across branches by design).
-- ============================================================================

-- Visible iff no branch is pinned (org-wide caller) or it matches the pinned one.
CREATE OR REPLACE FUNCTION public.branch_visible(row_branch uuid) RETURNS boolean
  LANGUAGE sql STABLE
  SET search_path = ''
  AS $$ SELECT public.user_branch_id() IS NULL OR row_branch = public.user_branch_id() $$;

-- ── branch: a locked user sees only their own branch row ────────────────────
DROP POLICY IF EXISTS branch_read ON public.branch;
CREATE POLICY branch_read ON public.branch FOR SELECT
  USING (organization_id = public.user_organization_id() AND public.branch_visible(id));

-- ── sale ────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS sale_rls ON public.sale;
CREATE POLICY sale_rls ON public.sale FOR ALL
  USING      (organization_id = public.user_organization_id() AND public.branch_visible(branch_id))
  WITH CHECK (organization_id = public.user_organization_id() AND public.branch_visible(branch_id));

-- ── shift ─────────────────────────────────────────────────────────────────--
DROP POLICY IF EXISTS shift_rls ON public.shift;
CREATE POLICY shift_rls ON public.shift FOR ALL
  USING      (organization_id = public.user_organization_id() AND public.branch_visible(branch_id))
  WITH CHECK (organization_id = public.user_organization_id() AND public.branch_visible(branch_id));

-- ── product_batch (inventory lives here, per branch) ────────────────────────
DROP POLICY IF EXISTS product_batch_rls ON public.product_batch;
CREATE POLICY product_batch_rls ON public.product_batch FOR ALL
  USING      (organization_id = public.user_organization_id() AND public.branch_visible(branch_id))
  WITH CHECK (organization_id = public.user_organization_id() AND public.branch_visible(branch_id));

-- ── stock_adjustment (no branch_id; scope via its batch) ────────────────────
DROP POLICY IF EXISTS stock_adjustment_rls ON public.stock_adjustment;
CREATE POLICY stock_adjustment_rls ON public.stock_adjustment FOR ALL
  USING (organization_id = public.user_organization_id() AND batch_id IN (
           SELECT pb.id FROM public.product_batch pb
           WHERE pb.organization_id = public.user_organization_id()
             AND public.branch_visible(pb.branch_id)))
  WITH CHECK (organization_id = public.user_organization_id() AND batch_id IN (
           SELECT pb.id FROM public.product_batch pb
           WHERE pb.organization_id = public.user_organization_id()
             AND public.branch_visible(pb.branch_id)));

-- ── sale_item (no branch_id; scope via its sale) ────────────────────────────
DROP POLICY IF EXISTS sale_item_rls ON public.sale_item;
CREATE POLICY sale_item_rls ON public.sale_item FOR ALL
  USING (sale_id IN (
           SELECT s.id FROM public.sale s
           WHERE s.organization_id = public.user_organization_id()
             AND public.branch_visible(s.branch_id)))
  WITH CHECK (sale_id IN (
           SELECT s.id FROM public.sale s
           WHERE s.organization_id = public.user_organization_id()
             AND public.branch_visible(s.branch_id)));

-- ── payment (no branch_id; scope via its sale) ──────────────────────────────
DROP POLICY IF EXISTS payment_rls ON public.payment;
CREATE POLICY payment_rls ON public.payment FOR ALL
  USING (sale_id IN (
           SELECT s.id FROM public.sale s
           WHERE s.organization_id = public.user_organization_id()
             AND public.branch_visible(s.branch_id)))
  WITH CHECK (sale_id IN (
           SELECT s.id FROM public.sale s
           WHERE s.organization_id = public.user_organization_id()
             AND public.branch_visible(s.branch_id)));

-- migrate:down
-- Revert to plain org-scoped policies (pre-branch-lock).
DROP POLICY IF EXISTS branch_read ON public.branch;
CREATE POLICY branch_read ON public.branch FOR SELECT
  USING (organization_id = public.user_organization_id());

DROP POLICY IF EXISTS sale_rls ON public.sale;
CREATE POLICY sale_rls ON public.sale FOR ALL
  USING (organization_id = public.user_organization_id())
  WITH CHECK (organization_id = public.user_organization_id());

DROP POLICY IF EXISTS shift_rls ON public.shift;
CREATE POLICY shift_rls ON public.shift FOR ALL
  USING (organization_id = public.user_organization_id())
  WITH CHECK (organization_id = public.user_organization_id());

DROP POLICY IF EXISTS product_batch_rls ON public.product_batch;
CREATE POLICY product_batch_rls ON public.product_batch FOR ALL
  USING (organization_id = public.user_organization_id())
  WITH CHECK (organization_id = public.user_organization_id());

DROP POLICY IF EXISTS stock_adjustment_rls ON public.stock_adjustment;
CREATE POLICY stock_adjustment_rls ON public.stock_adjustment FOR ALL
  USING (organization_id = public.user_organization_id())
  WITH CHECK (organization_id = public.user_organization_id());

DROP POLICY IF EXISTS sale_item_rls ON public.sale_item;
CREATE POLICY sale_item_rls ON public.sale_item FOR ALL
  USING (sale_id IN (SELECT sale.id FROM public.sale WHERE sale.organization_id = public.user_organization_id()))
  WITH CHECK (sale_id IN (SELECT sale.id FROM public.sale WHERE sale.organization_id = public.user_organization_id()));

DROP POLICY IF EXISTS payment_rls ON public.payment;
CREATE POLICY payment_rls ON public.payment FOR ALL
  USING (sale_id IN (SELECT sale.id FROM public.sale WHERE sale.organization_id = public.user_organization_id()))
  WITH CHECK (sale_id IN (SELECT sale.id FROM public.sale WHERE sale.organization_id = public.user_organization_id()));

DROP FUNCTION IF EXISTS public.branch_visible(uuid);
