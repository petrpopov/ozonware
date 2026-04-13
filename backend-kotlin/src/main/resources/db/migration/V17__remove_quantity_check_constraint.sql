-- Remove CHECK (quantity >= 0) constraint to allow negative stock
-- Negative stock is now handled at the application layer with a warning log
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_quantity_check;
