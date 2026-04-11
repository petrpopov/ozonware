-- V13: Phase 4 — OZON table cleanup
-- 1. Drop ozon_daily_shipments (unused — FBS tracking moved to operation_items + channel_code)
-- 2. Fix TIMESTAMPTZ → TIMESTAMP for ozon_fbo_supplies timestamp columns (align with LocalDateTime/UTC convention)
-- 3. Drop dead column operations.ozon_posting_id (not mapped in entity, never used)

-- 1. Drop ozon_daily_shipments (CASCADE drops dependent indexes and FK constraints)
DROP TABLE IF EXISTS ozon_daily_shipments CASCADE;

-- 2. Convert TIMESTAMPTZ → TIMESTAMP (at UTC) for ozon_fbo_supplies
ALTER TABLE ozon_fbo_supplies
    ALTER COLUMN order_created_date TYPE TIMESTAMP USING order_created_date AT TIME ZONE 'UTC',
    ALTER COLUMN state_updated_date TYPE TIMESTAMP USING state_updated_date AT TIME ZONE 'UTC',
    ALTER COLUMN arrival_date       TYPE TIMESTAMP USING arrival_date       AT TIME ZONE 'UTC';

-- 3. Drop dead column operations.ozon_posting_id
ALTER TABLE operations DROP COLUMN IF EXISTS ozon_posting_id;
