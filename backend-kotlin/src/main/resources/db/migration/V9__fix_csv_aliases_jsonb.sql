-- V9: csv_aliases TEXT[] → JSONB для корректного маппинга Hibernate 6 + hypersistence-utils.
-- to_json(text[]) конвертирует PostgreSQL массив в JSON-массив строк.

ALTER TABLE ozon_posting_statuses ALTER COLUMN csv_aliases DROP DEFAULT;

ALTER TABLE ozon_posting_statuses
    ALTER COLUMN csv_aliases TYPE JSONB
    USING to_json(csv_aliases);

ALTER TABLE ozon_posting_statuses
    ALTER COLUMN csv_aliases SET DEFAULT '[]'::jsonb;
