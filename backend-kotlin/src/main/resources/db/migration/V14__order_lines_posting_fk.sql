-- V14: Phase 5 — ozon_order_lines cleanup
-- 1. Add posting_id FK to ozon_postings (nullable, NOT VALID — existing rows not checked)
-- 2. Backfill posting_id from posting_number join
-- 3. Add CHECK on source column (NOT VALID — existing rows not checked)
-- 4. Add index on posting_id

-- 1. Add nullable posting_id column, then FK as separate constraint (NOT VALID requires ADD CONSTRAINT syntax)
ALTER TABLE ozon_order_lines ADD COLUMN IF NOT EXISTS posting_id BIGINT;

ALTER TABLE ozon_order_lines
    ADD CONSTRAINT fk_order_lines_posting
    FOREIGN KEY (posting_id) REFERENCES ozon_postings(id) ON DELETE SET NULL NOT VALID;

-- 2. Backfill where posting exists in our DB
UPDATE ozon_order_lines ol
SET posting_id = op.id
FROM ozon_postings op
WHERE op.posting_number = ol.posting_number
  AND ol.posting_id IS NULL;

-- 3. Source check constraint (NOT VALID — existing data already filtered at import)
ALTER TABLE ozon_order_lines
    ADD CONSTRAINT chk_order_lines_source
    CHECK (source IN ('fbs_csv', 'fbo_csv')) NOT VALID;

-- 4. Partial index — only rows where posting matched
CREATE INDEX idx_order_lines_posting_id ON ozon_order_lines(posting_id) WHERE posting_id IS NOT NULL;
