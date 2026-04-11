-- V15: Phase 7 — DROP legacy JSONB columns.
-- Data was backfilled into normalized tables in V10 (product_field_values)
-- and V12 (operation_items / operation_inventory_diffs).
-- Dual-write was active since those migrations; no data loss.

ALTER TABLE operations DROP COLUMN IF EXISTS items;
ALTER TABLE operations DROP COLUMN IF EXISTS differences;
ALTER TABLE products   DROP COLUMN IF EXISTS custom_fields;
