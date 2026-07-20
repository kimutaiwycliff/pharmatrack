-- migrate:up
-- amount_tendered/change_given/customer_name/customer_phone were only ever
-- echoed back in the /api/sales POST response for the just-completed receipt,
-- never persisted — so a reprint of a historical sale couldn't show them.
ALTER TABLE sale
  ADD COLUMN amount_tendered numeric(12,2),
  ADD COLUMN change_given numeric(12,2),
  ADD COLUMN customer_name text,
  ADD COLUMN customer_phone text;

-- Same problem one level down: the receipt line items render base_unit
-- (e.g. "x2 tablet"), but that came from an in-memory side-channel during the
-- sale, never a stored column — a reprint would render it blank.
ALTER TABLE sale_item
  ADD COLUMN base_unit text,
  ADD COLUMN product_strength text;

-- migrate:down
ALTER TABLE sale_item
  DROP COLUMN base_unit,
  DROP COLUMN product_strength;

ALTER TABLE sale
  DROP COLUMN amount_tendered,
  DROP COLUMN change_given,
  DROP COLUMN customer_name,
  DROP COLUMN customer_phone;
