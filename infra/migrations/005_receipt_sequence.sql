-- migrate:up
-- Receipt numbers: a single global, monotonic sequence. The app formats it as
-- RCP-YYMMDD-NNNNNN in code (see /api/sales). app_authenticated needs USAGE to
-- call nextval() under RLS.
CREATE SEQUENCE IF NOT EXISTS receipt_number_seq;
GRANT USAGE, SELECT ON SEQUENCE receipt_number_seq TO app_authenticated;

-- migrate:down
DROP SEQUENCE IF EXISTS receipt_number_seq;
