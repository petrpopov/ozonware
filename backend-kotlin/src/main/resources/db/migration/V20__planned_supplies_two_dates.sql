ALTER TABLE planned_supplies RENAME COLUMN planned_date TO purchase_date;
ALTER TABLE planned_supplies ADD COLUMN expected_date DATE;
