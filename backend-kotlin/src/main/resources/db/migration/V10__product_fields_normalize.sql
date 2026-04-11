-- V10: Phase 2 — product_fields EAV normalization.
-- Adds type_code/kind/is_system to product_fields.
-- Creates product_field_options (replaces JSONB options array).
-- Creates product_field_values (normalizes products.custom_fields).
-- Dual-write: custom_fields JSONB is kept until Phase 7.

-- 1. Extend product_fields
ALTER TABLE product_fields
    ADD COLUMN type_code VARCHAR(32) REFERENCES product_field_types(code),
    ADD COLUMN kind      VARCHAR(48),
    ADD COLUMN is_system BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Backfill type_code from existing type where type exists in product_field_types
UPDATE product_fields
SET type_code = type
WHERE type IN (SELECT code FROM product_field_types);

-- 3. Mark system / special fields by known name
UPDATE product_fields SET is_system = TRUE, kind = 'ozon_photo'   WHERE name = 'Фото OZON';
UPDATE product_fields SET kind = 'ozon_article'                     WHERE name = 'Артикул OZON';
UPDATE product_fields SET kind = 'ozon_sku'                         WHERE name = 'OZON';

-- 4. product_field_options: replaces the JSONB options[] array per field
CREATE TABLE product_field_options (
    id       BIGINT GENERATED ALWAYS AS IDENTITY NOT NULL PRIMARY KEY,
    field_id BIGINT  NOT NULL REFERENCES product_fields(id) ON DELETE CASCADE,
    label    TEXT    NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    UNIQUE (field_id, label)
);

CREATE INDEX idx_pfo_field_id ON product_field_options(field_id);

-- 5. Backfill options from JSONB array in product_fields.options
INSERT INTO product_field_options (field_id, label, position)
SELECT pf.id,
       opt.value,
       (opt.ordinality - 1) * 10
FROM   product_fields pf,
       jsonb_array_elements_text(COALESCE(pf.options, '[]'::jsonb))
           WITH ORDINALITY AS opt(value, ordinality)
WHERE  jsonb_array_length(COALESCE(pf.options, '[]'::jsonb)) > 0
ON CONFLICT (field_id, label) DO NOTHING;

-- 6. product_field_values: normalized EAV storage
CREATE TABLE product_field_values (
    id              BIGINT GENERATED ALWAYS AS IDENTITY NOT NULL PRIMARY KEY,
    product_id      BIGINT   NOT NULL REFERENCES products(id)              ON DELETE CASCADE,
    field_id        BIGINT   NOT NULL REFERENCES product_fields(id)         ON DELETE CASCADE,
    value_text      TEXT,
    value_number    NUMERIC,
    value_color     VARCHAR(16),
    value_option_id BIGINT   REFERENCES product_field_options(id)          ON DELETE SET NULL,
    UNIQUE (product_id, field_id)
);

CREATE INDEX idx_pfv_product_id ON product_field_values(product_id);
CREATE INDEX idx_pfv_field_id   ON product_field_values(field_id);

-- 7. Backfill product_field_values from products.custom_fields JSONB
WITH cf_data AS (
    SELECT p.id                   AS product_id,
           entry->>'name'         AS field_name,
           entry->>'value'        AS field_value
    FROM   products p,
           jsonb_array_elements(COALESCE(p.custom_fields, '[]'::jsonb)) AS entry
    WHERE  entry->>'value' IS NOT NULL
      AND  TRIM(entry->>'value') <> ''
)
INSERT INTO product_field_values (product_id, field_id, value_text)
SELECT cf.product_id, pf.id, cf.field_value
FROM   cf_data cf
JOIN   product_fields pf ON lower(pf.name) = lower(cf.field_name)
ON CONFLICT (product_id, field_id) DO NOTHING;
