-- V11: Phase 3 — operations EAV normalization.
-- Adds type_code, channel_code, parent_operation_id, correction_reason_id to operations.
-- Creates operation_items and operation_inventory_diffs tables.
-- Dual-write: operations.items / differences JSONB kept until Phase 7.

-- 1. Extend operations table
ALTER TABLE operations
    ADD COLUMN type_code            VARCHAR(32) REFERENCES operation_types(code),
    ADD COLUMN channel_code         VARCHAR(32) NOT NULL DEFAULT 'manual' REFERENCES operation_channels(code),
    ADD COLUMN parent_operation_id  BIGINT      REFERENCES operations(id) ON DELETE SET NULL,
    ADD COLUMN correction_reason_id BIGINT      REFERENCES correction_reasons(id);

-- 2. Backfill type_code
UPDATE operations SET type_code = type;

-- 3. Backfill channel_code from note
UPDATE operations SET channel_code = CASE
    WHEN note ILIKE 'OZON FBS%' THEN 'ozon_fbs'
    WHEN note ILIKE 'OZON FBO%' THEN 'ozon_fbo'
    ELSE 'manual'
END;

-- 4. Backfill parent_operation_id for corrections linked via note pattern
UPDATE operations c
SET parent_operation_id  = NULLIF(substring(c.note FROM 'Корректировка после отгрузки #(\d+)'), '')::bigint,
    correction_reason_id = (SELECT id FROM correction_reasons WHERE code = 'post_shipment')
WHERE c.type = 'correction'
  AND c.note ~ 'Корректировка после отгрузки #\d+';

CREATE INDEX idx_operations_channel_code         ON operations(channel_code);
CREATE INDEX idx_operations_parent_operation_id  ON operations(parent_operation_id);
CREATE INDEX idx_operations_type_code            ON operations(type_code);

-- 5. operation_items: normalized rows for receipt/shipment/writeoff/correction
CREATE TABLE operation_items (
    id                    BIGINT GENERATED ALWAYS AS IDENTITY NOT NULL PRIMARY KEY,
    operation_id          BIGINT  NOT NULL REFERENCES operations(id)      ON DELETE CASCADE,
    product_id            BIGINT  NOT NULL REFERENCES products(id)         ON DELETE RESTRICT,
    requested_qty         NUMERIC NOT NULL DEFAULT 0,
    applied_qty           NUMERIC,
    delta                 NUMERIC,
    writeoff_reason_id    BIGINT  REFERENCES writeoff_reasons(id)          ON DELETE SET NULL,
    writeoff_reason_text  TEXT,
    product_name_snapshot TEXT    NOT NULL DEFAULT '',
    product_sku_snapshot  VARCHAR(128) NOT NULL DEFAULT '',
    item_note             TEXT,
    created_at            TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')
);

CREATE INDEX idx_oi_operation_id ON operation_items(operation_id);
CREATE INDEX idx_oi_product_id   ON operation_items(product_id);

-- 6. operation_inventory_diffs: inventory adjustments
CREATE TABLE operation_inventory_diffs (
    id                    BIGINT GENERATED ALWAYS AS IDENTITY NOT NULL PRIMARY KEY,
    operation_id          BIGINT  NOT NULL REFERENCES operations(id)      ON DELETE CASCADE,
    product_id            BIGINT  NOT NULL REFERENCES products(id)         ON DELETE RESTRICT,
    expected              NUMERIC NOT NULL DEFAULT 0,
    actual                NUMERIC NOT NULL DEFAULT 0,
    diff                  NUMERIC GENERATED ALWAYS AS (actual - expected) STORED,
    product_name_snapshot TEXT    NOT NULL DEFAULT '',
    product_sku_snapshot  VARCHAR(128) NOT NULL DEFAULT '',
    created_at            TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')
);

CREATE INDEX idx_oid_operation_id ON operation_inventory_diffs(operation_id);
