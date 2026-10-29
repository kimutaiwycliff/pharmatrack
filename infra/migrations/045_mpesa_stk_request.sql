-- migrate:up
-- Every M-Pesa STK push the till sends, so the payment can be confirmed and
-- tied to one sale. Before this, the push wasn't recorded: Safaricom's
-- callback was only logged and the cashier's "Confirm received" was trusted.
--
-- A request is marked paid only after an STK Query confirms it (callbacks
-- aren't signed); `sale_id` is set when a sale uses it, so one payment can't
-- back two sales.
CREATE TABLE mpesa_stk_request (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      text NOT NULL REFERENCES "organization"(id) ON DELETE CASCADE,
  checkout_request_id  text NOT NULL UNIQUE,   -- Daraja's CheckoutRequestID
  merchant_request_id  text,
  phone                text NOT NULL,          -- 2547XXXXXXXX, as pushed
  amount               numeric(12,2) NOT NULL, -- what the prompt asked for (whole KES)
  status               text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled', 'failed')),
  result_code          text,
  result_desc          text,
  mpesa_receipt        text,                   -- from the callback (STK Query doesn't return it)
  sale_id              uuid REFERENCES sale(id) ON DELETE SET NULL,
  requested_by         text REFERENCES "user"(id) ON DELETE SET NULL,
  last_checked_at      timestamptz,            -- last STK Query (Daraja rate-limits them)
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_mpesa_stk_request_org_created ON mpesa_stk_request (organization_id, created_at DESC);

ALTER TABLE mpesa_stk_request ENABLE ROW LEVEL SECURITY;
CREATE POLICY mpesa_stk_request_rls ON mpesa_stk_request FOR ALL
  USING (organization_id = public.user_organization_id())
  WITH CHECK (organization_id = public.user_organization_id());

-- migrate:down
DROP TABLE IF EXISTS mpesa_stk_request;
