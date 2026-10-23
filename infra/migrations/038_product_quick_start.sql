-- migrate:up
-- Products added by Quick Start (the catalogue picker). "Undo Quick Start"
-- removes only these — and only while they have no stock or sales — never a
-- product a teammate added by hand from a catalogue match (which also carries
-- catalog_id). Until now Quick Start was told apart by catalog_id pointing at a
-- curated catalogue row; those products are flagged here.
ALTER TABLE product ADD COLUMN quick_start boolean NOT NULL DEFAULT false;

UPDATE product p SET quick_start = true
FROM drug_catalog d
WHERE d.id = p.catalog_id AND d.source = 'curated';

-- migrate:down
ALTER TABLE product DROP COLUMN IF EXISTS quick_start;
