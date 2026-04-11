-- V16: DROP operations.type — fully replaced by type_code (backfilled in V11).
-- Make type_code NOT NULL before dropping the legacy column.

UPDATE operations SET type_code = type WHERE type_code IS NULL;
ALTER TABLE operations ALTER COLUMN type_code SET NOT NULL;
ALTER TABLE operations DROP COLUMN type;
