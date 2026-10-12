-- migrate:up
-- Offline-first mobile sync (R1). Registered devices sell offline against a
-- per-device stock allowance, push shifts/sales in order, and pull catalogue
-- changes by cursor. See apps/web/lib/sync/*.

-- ── Registered devices ───────────────────────────────────────────────────────
CREATE TABLE device (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  branch_id          uuid NOT NULL REFERENCES branch(id) DEFERRABLE INITIALLY DEFERRED,
  name               text NOT NULL,
  device_code        text NOT NULL,          -- short code printed in receipt numbers
  token_hash         text NOT NULL UNIQUE,   -- sha256 of the device token (never stored raw)
  platform           text,
  app_version        text,
  -- Owner override of this device's share of branch stock (0-100). NULL = automatic.
  allocation_percent numeric(5,2) CHECK (allocation_percent IS NULL OR (allocation_percent >= 0 AND allocation_percent <= 100)),
  registered_by      text REFERENCES "user"("id") ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  last_seen_at       timestamptz,
  last_sync_at       timestamptz,
  revoked_at         timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, device_code)
);
ALTER TABLE device ENABLE ROW LEVEL SECURITY;
CREATE POLICY device_rls ON device FOR ALL
  USING (organization_id = public.user_organization_id() AND public.branch_visible(branch_id))
  WITH CHECK (organization_id = public.user_organization_id() AND public.branch_visible(branch_id));

-- ── Per-device stock allowance ───────────────────────────────────────────────
-- What a device may still sell of each product offline. Allowances across a
-- branch never exceed its real stock, so offline devices can't oversell. The
-- server keeps the reservation until `reserved_until` (next midnight + grace
-- for a manager override); expired rows are ignored and replaced on next sync.
CREATE TABLE device_stock_allocation (
  device_id      uuid NOT NULL REFERENCES device(id) ON DELETE CASCADE,
  product_id     uuid NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  quantity       integer NOT NULL CHECK (quantity >= 0),
  reserved_until timestamptz NOT NULL,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (device_id, product_id)
);
CREATE INDEX idx_device_alloc_product ON device_stock_allocation(product_id);
ALTER TABLE device_stock_allocation ENABLE ROW LEVEL SECURITY;
CREATE POLICY device_alloc_rls ON device_stock_allocation FOR ALL
  USING (device_id IN (SELECT id FROM device WHERE organization_id = public.user_organization_id() AND public.branch_visible(branch_id)))
  WITH CHECK (device_id IN (SELECT id FROM device WHERE organization_id = public.user_organization_id() AND public.branch_visible(branch_id)));

-- ── Offline fields on sales and shifts ───────────────────────────────────────
-- sale.created_at holds the real time of sale for device sales; synced_at is
-- when the server received it.
ALTER TABLE sale  ADD COLUMN device_id uuid REFERENCES device(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE sale  ADD COLUMN synced_at timestamptz;
ALTER TABLE shift ADD COLUMN device_id uuid REFERENCES device(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE shift ADD COLUMN client_id text;
CREATE UNIQUE INDEX shift_client_id_per_org ON shift (organization_id, client_id) WHERE client_id IS NOT NULL;
CREATE INDEX idx_sale_device_created ON sale (device_id, created_at) WHERE device_id IS NOT NULL;
-- Device receipt numbers (CODE-YYMMDD-NNNN) are generated offline; keep them unique per org.
CREATE UNIQUE INDEX sale_device_receipt_per_org ON sale (organization_id, receipt_number) WHERE device_id IS NOT NULL;

-- ── Sync issues inbox ────────────────────────────────────────────────────────
CREATE TABLE sync_issue (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  branch_id       uuid NOT NULL REFERENCES branch(id) DEFERRABLE INITIALLY DEFERRED,
  device_id       uuid REFERENCES device(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  kind            text NOT NULL CHECK (kind IN (
                    'oversell', 'price_mismatch', 'override_used', 'late_sync',
                    'mpesa_unverified', 'shift_conflict', 'rejected_sale')),
  sale_id         uuid REFERENCES sale(id) ON DELETE CASCADE,
  shift_id        uuid REFERENCES shift(id) ON DELETE CASCADE,
  product_id      uuid REFERENCES product(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  details         jsonb NOT NULL DEFAULT '{}',
  status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  resolved_by     text REFERENCES "user"("id") ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  resolved_at     timestamptz,
  resolution_note text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sync_issue_open ON sync_issue (organization_id, status, created_at DESC);
ALTER TABLE sync_issue ENABLE ROW LEVEL SECURITY;
CREATE POLICY sync_issue_rls ON sync_issue FOR ALL
  USING (organization_id = public.user_organization_id() AND public.branch_visible(branch_id))
  WITH CHECK (organization_id = public.user_organization_id() AND public.branch_visible(branch_id));

-- ── Delta pull: change tracking + tombstones ────────────────────────────────
ALTER TABLE category          ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE product_pack_size ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE staff_profile     ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX idx_product_updated ON product (organization_id, updated_at);

-- Every UPDATE bumps updated_at, so code paths that forget to set it (seed,
-- split-unit, bulk import…) still reach devices.
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
CREATE TRIGGER trg_product_touch   BEFORE UPDATE ON product           FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_pack_touch      BEFORE UPDATE ON product_pack_size FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_category_touch  BEFORE UPDATE ON category          FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_staff_touch     BEFORE UPDATE ON staff_profile     FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE sync_tombstone (
  id              bigserial PRIMARY KEY,
  organization_id text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  entity          text NOT NULL,
  entity_id       text NOT NULL,
  deleted_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tombstone_org_time ON sync_tombstone (organization_id, deleted_at);
ALTER TABLE sync_tombstone ENABLE ROW LEVEL SECURITY;
CREATE POLICY sync_tombstone_rls ON sync_tombstone FOR ALL
  USING (organization_id = public.user_organization_id())
  WITH CHECK (organization_id = public.user_organization_id());

-- SECURITY DEFINER: deletes can cascade from contexts (tenant purge) where the
-- tombstone insert would otherwise trip RLS.
CREATE OR REPLACE FUNCTION public.record_tombstone() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE org text;
BEGIN
  IF TG_TABLE_NAME = 'product_pack_size' THEN
    SELECT organization_id INTO org FROM product WHERE id = OLD.product_id;
    IF org IS NULL THEN RETURN OLD; END IF;  -- whole product going: its own tombstone covers it
  ELSE
    org := OLD.organization_id;
  END IF;
  -- Skip when the org itself is being deleted (tenant purge).
  IF NOT EXISTS (SELECT 1 FROM "organization" WHERE id = org) THEN RETURN OLD; END IF;
  -- via jsonb: plpgsql can't reference OLD.user_id on tables that lack it,
  -- even in a branch that never runs.
  INSERT INTO sync_tombstone (organization_id, entity, entity_id)
  VALUES (org, TG_TABLE_NAME, coalesce(to_jsonb(OLD)->>'id', to_jsonb(OLD)->>'user_id'));
  RETURN OLD;
END $$;
CREATE TRIGGER trg_product_tomb  AFTER DELETE ON product           FOR EACH ROW EXECUTE FUNCTION public.record_tombstone();
CREATE TRIGGER trg_pack_tomb     AFTER DELETE ON product_pack_size FOR EACH ROW EXECUTE FUNCTION public.record_tombstone();
CREATE TRIGGER trg_category_tomb AFTER DELETE ON category          FOR EACH ROW EXECUTE FUNCTION public.record_tombstone();
CREATE TRIGGER trg_staff_tomb    AFTER DELETE ON staff_profile     FOR EACH ROW EXECUTE FUNCTION public.record_tombstone();

-- migrate:down
DROP TRIGGER IF EXISTS trg_staff_tomb ON staff_profile;
DROP TRIGGER IF EXISTS trg_category_tomb ON category;
DROP TRIGGER IF EXISTS trg_pack_tomb ON product_pack_size;
DROP TRIGGER IF EXISTS trg_product_tomb ON product;
DROP FUNCTION IF EXISTS public.record_tombstone();
DROP TABLE IF EXISTS sync_tombstone;
DROP TRIGGER IF EXISTS trg_staff_touch ON staff_profile;
DROP TRIGGER IF EXISTS trg_category_touch ON category;
DROP TRIGGER IF EXISTS trg_pack_touch ON product_pack_size;
DROP TRIGGER IF EXISTS trg_product_touch ON product;
DROP FUNCTION IF EXISTS public.touch_updated_at();
DROP INDEX IF EXISTS idx_product_updated;
ALTER TABLE staff_profile DROP COLUMN IF EXISTS updated_at;
ALTER TABLE product_pack_size DROP COLUMN IF EXISTS updated_at;
ALTER TABLE category DROP COLUMN IF EXISTS updated_at;
DROP TABLE IF EXISTS sync_issue;
DROP INDEX IF EXISTS sale_device_receipt_per_org;
DROP INDEX IF EXISTS idx_sale_device_created;
DROP INDEX IF EXISTS shift_client_id_per_org;
ALTER TABLE shift DROP COLUMN IF EXISTS client_id;
ALTER TABLE shift DROP COLUMN IF EXISTS device_id;
ALTER TABLE sale DROP COLUMN IF EXISTS synced_at;
ALTER TABLE sale DROP COLUMN IF EXISTS device_id;
DROP TABLE IF EXISTS device_stock_allocation;
DROP TABLE IF EXISTS device;
