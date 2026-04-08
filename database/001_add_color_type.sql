-- Миграция: Добавление типа поля "color"
-- Дата: 2026-01-31

-- Удаляем старый constraint
ALTER TABLE product_fields DROP CONSTRAINT IF EXISTS product_fields_type_check;

-- Добавляем новый constraint с типом color
ALTER TABLE product_fields ADD CONSTRAINT product_fields_type_check 
    CHECK (type IN ('barcode', 'text', 'number', 'color', 'image', 'select'));
