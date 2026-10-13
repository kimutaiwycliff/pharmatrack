-- migrate:up
-- Idempotency keys for stock-creating writes (receive stock, create a purchase
-- order, receive a delivery). A client sends `Idempotency-Key: <id>` once per
-- submission and reuses it if it has to retry (timeout, dropped connection).
-- The key is claimed in the SAME transaction as the write, so:
--   * a retry after the first request committed replays the stored answer
--     instead of creating a second batch / order;
--   * two copies racing each other serialise on the primary key — the second
--     waits for the first to commit, then replays it;
--   * a request that failed rolls its claim back, so the retry runs for real.
-- See apps/web/lib/api/idempotency.ts. Requests without the header behave as
-- before (older app versions keep working).

CREATE TABLE idempotency_key (
  organization_id text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  key             text NOT NULL CHECK (char_length(key) BETWEEN 8 AND 100),
  scope           text NOT NULL,          -- route + target, e.g. 'po.receive:<id>'
  status_code     integer,                -- NULL only inside the claiming transaction
  response        jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, key)
);
CREATE INDEX idx_idempotency_key_created ON idempotency_key (organization_id, created_at);

ALTER TABLE idempotency_key ENABLE ROW LEVEL SECURITY;
CREATE POLICY idempotency_key_rls ON idempotency_key FOR ALL
  USING (organization_id = public.user_organization_id())
  WITH CHECK (organization_id = public.user_organization_id());

-- migrate:down
DROP TABLE IF EXISTS idempotency_key;
