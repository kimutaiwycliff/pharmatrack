-- migrate:up
-- Snapshot of the cost per base unit of what was sold, so profit/COGS for a
-- sale survives the product (or batch) being permanently deleted later. Set at
-- sale time from the batch cost (falling back to the product cost), and frozen
-- onto a product's existing sale lines right before a permanent delete unlinks
-- them. NULL on older rows means "derive it from the batch/product join", which
-- is exactly what the reports did before this column existed.
ALTER TABLE sale_item ADD COLUMN unit_cost numeric(12,2);

-- migrate:down
ALTER TABLE sale_item DROP COLUMN unit_cost;
