-- V4: Fix ozon_posting_items.ozon_sku from bigint to varchar(250)
-- ozon_sku должен быть строкой (SKU/OZON артикул), а не числовым идентификатором

ALTER TABLE public.ozon_posting_items
    ALTER COLUMN ozon_sku TYPE VARCHAR(250) USING ozon_sku::TEXT;
