-- migrate:up
-- A person can only have ONE open shift. Before this, clocking in never checked
-- for an existing open shift, so owners (who can clock in from the top bar, the
-- POS gate and the mobile app, each with a different branch) piled up several;
-- closing the newest just surfaced an older one, so the shift looked endless.
--
-- Clean up existing duplicates first: keep each person's NEWEST open shift and
-- close the older ones at their own opening time with no cash count (so they
-- don't fabricate a variance), leaving a note explaining why.
UPDATE shift s
SET closed_at = s.opened_at,
    notes = concat_ws(E'\n', s.notes, 'Auto-closed by system: duplicate open shift (only one open shift per person is allowed).')
WHERE s.closed_at IS NULL
  AND EXISTS (
    SELECT 1 FROM shift newer
    WHERE newer.cashier_id = s.cashier_id
      AND newer.closed_at IS NULL
      AND (newer.opened_at, newer.id) > (s.opened_at, s.id)
  );

CREATE UNIQUE INDEX shift_one_open_per_person ON shift (cashier_id) WHERE closed_at IS NULL;

-- migrate:down
DROP INDEX IF EXISTS shift_one_open_per_person;
