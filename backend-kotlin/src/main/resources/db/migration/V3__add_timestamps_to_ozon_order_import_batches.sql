-- V3: Add created_at/updated_at to ozon_order_import_batches
-- Заполняем из imported_at для существующих записей

ALTER TABLE public.ozon_order_import_batches
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Заполняем существующие строки значением из imported_at
UPDATE public.ozon_order_import_batches
SET created_at = imported_at,
    updated_at = imported_at
WHERE created_at IS NULL;

-- Делаем колонки NOT NULL после заполнения
ALTER TABLE public.ozon_order_import_batches
    ALTER COLUMN created_at SET NOT NULL,
    ALTER COLUMN updated_at SET NOT NULL;
