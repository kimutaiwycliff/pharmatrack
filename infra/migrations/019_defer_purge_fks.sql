-- migrate:up
-- purgeTenant() deletes an organization in one transaction, relying on every
-- org-scoped table's own `organization_id ON DELETE CASCADE` to disappear.
-- But plain (non-deferrable) FK constraints are checked IMMEDIATELY, not at
-- commit, so when two sibling tables both cascade from organization (e.g.
-- product and sale->sale_item), Postgres can delete one before the other and
-- trip a "still referenced from" error on a NO ACTION FK between them, purely
-- based on internal cascade ordering. Making these constraints DEFERRABLE
-- INITIALLY DEFERRED changes nothing about ordinary single-statement app
-- behavior (still checked at the implicit end of that statement) — it only
-- lets a multi-statement transaction like the purge finish every cascade
-- before any of these are validated.
ALTER TABLE staff_profile     ALTER CONSTRAINT staff_profile_branch_id_fkey           DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE product           ALTER CONSTRAINT product_category_id_fkey              DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE product           ALTER CONSTRAINT product_supplier_id_fkey              DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE product_batch     ALTER CONSTRAINT product_batch_branch_id_fkey          DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE product_batch     ALTER CONSTRAINT product_batch_supplier_id_fkey        DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE stock_adjustment  ALTER CONSTRAINT stock_adjustment_batch_id_fkey        DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE shift             ALTER CONSTRAINT shift_branch_id_fkey                  DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE sale              ALTER CONSTRAINT sale_shift_id_fkey                    DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE sale              ALTER CONSTRAINT sale_branch_id_fkey                   DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE sale_item         ALTER CONSTRAINT sale_item_product_id_fkey             DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE sale_item         ALTER CONSTRAINT sale_item_batch_id_fkey               DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE appointment       ALTER CONSTRAINT appointment_branch_id_fkey            DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE appointment       ALTER CONSTRAINT appointment_parent_appointment_id_fkey DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE appointment       ALTER CONSTRAINT appointment_customer_id_fkey          DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE appointment       ALTER CONSTRAINT appointment_service_id_fkey           DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE prescription      ALTER CONSTRAINT prescription_customer_id_fkey         DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE prescription      ALTER CONSTRAINT prescription_sale_id_fkey             DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE prescription_item ALTER CONSTRAINT prescription_item_product_id_fkey     DEFERRABLE INITIALLY DEFERRED;

-- migrate:down
ALTER TABLE staff_profile     ALTER CONSTRAINT staff_profile_branch_id_fkey           NOT DEFERRABLE;
ALTER TABLE product           ALTER CONSTRAINT product_category_id_fkey              NOT DEFERRABLE;
ALTER TABLE product           ALTER CONSTRAINT product_supplier_id_fkey              NOT DEFERRABLE;
ALTER TABLE product_batch     ALTER CONSTRAINT product_batch_branch_id_fkey          NOT DEFERRABLE;
ALTER TABLE product_batch     ALTER CONSTRAINT product_batch_supplier_id_fkey        NOT DEFERRABLE;
ALTER TABLE stock_adjustment  ALTER CONSTRAINT stock_adjustment_batch_id_fkey        NOT DEFERRABLE;
ALTER TABLE shift             ALTER CONSTRAINT shift_branch_id_fkey                  NOT DEFERRABLE;
ALTER TABLE sale              ALTER CONSTRAINT sale_shift_id_fkey                    NOT DEFERRABLE;
ALTER TABLE sale              ALTER CONSTRAINT sale_branch_id_fkey                   NOT DEFERRABLE;
ALTER TABLE sale_item         ALTER CONSTRAINT sale_item_product_id_fkey             NOT DEFERRABLE;
ALTER TABLE sale_item         ALTER CONSTRAINT sale_item_batch_id_fkey               NOT DEFERRABLE;
ALTER TABLE appointment       ALTER CONSTRAINT appointment_branch_id_fkey            NOT DEFERRABLE;
ALTER TABLE appointment       ALTER CONSTRAINT appointment_parent_appointment_id_fkey NOT DEFERRABLE;
ALTER TABLE appointment       ALTER CONSTRAINT appointment_customer_id_fkey          NOT DEFERRABLE;
ALTER TABLE appointment       ALTER CONSTRAINT appointment_service_id_fkey           NOT DEFERRABLE;
ALTER TABLE prescription      ALTER CONSTRAINT prescription_customer_id_fkey         NOT DEFERRABLE;
ALTER TABLE prescription      ALTER CONSTRAINT prescription_sale_id_fkey             NOT DEFERRABLE;
ALTER TABLE prescription_item ALTER CONSTRAINT prescription_item_product_id_fkey     NOT DEFERRABLE;
