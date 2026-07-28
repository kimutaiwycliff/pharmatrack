-- migrate:up
-- Handover notes are already collected by the close-shift dialog but were
-- never persisted (no column existed) - PATCH /api/shifts silently dropped
-- them. Needed so a cashier can explain a cash variance for whoever reviews
-- shift history later.
ALTER TABLE shift
  ADD COLUMN notes text;

-- migrate:down
ALTER TABLE shift
  DROP COLUMN notes;
