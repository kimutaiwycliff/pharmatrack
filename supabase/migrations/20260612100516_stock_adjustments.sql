-- ============================================================
-- 013 — Manual stock adjustments (audit trail)
-- ============================================================
-- Stock-on-hand is derived from product_batches.quantity_remaining, so a
-- manual adjustment always targets a specific batch. Every change is logged
-- here with who/when/why so corrections, write-offs, and shrinkage are
-- traceable. Adding new stock still goes through receiving a batch.

CREATE TABLE IF NOT EXISTS stock_adjustments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  branch_id       uuid NOT NULL REFERENCES branches(id),
  product_id      uuid NOT NULL REFERENCES products(id),
  batch_id        uuid NOT NULL REFERENCES product_batches(id),

  -- Signed change applied to quantity_remaining (negative = reduction).
  delta           integer NOT NULL CHECK (delta <> 0),
  quantity_before integer NOT NULL CHECK (quantity_before >= 0),
  quantity_after  integer NOT NULL CHECK (quantity_after >= 0),

  reason          text NOT NULL CHECK (reason IN
                    ('count_correction','damage','expiry','theft_loss','return','other')),
  note            text,

  adjusted_by     uuid NOT NULL REFERENCES profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_adj_product ON stock_adjustments(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_adj_batch   ON stock_adjustments(batch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_adj_org     ON stock_adjustments(organization_id, created_at DESC);

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE public.stock_adjustments ENABLE ROW LEVEL SECURITY;

-- Any org member can read the adjustment history.
CREATE POLICY "stock_adjustments_select" ON public.stock_adjustments
  FOR SELECT USING (organization_id = user_organization_id());

-- Only owners and managers may record adjustments (write-offs are a
-- management control). The API enforces the same gate.
CREATE POLICY "stock_adjustments_insert" ON public.stock_adjustments
  FOR INSERT WITH CHECK (
    organization_id = user_organization_id()
    AND user_role() IN ('owner','manager')
  );

-- Audit rows are immutable — no update/delete policies are defined, so RLS
-- denies those operations to clients.
