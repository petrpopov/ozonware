-- V2: Convert all INT primary keys to BIGINT
-- ozon_order_lines уже BIGINT, пропускаем

BEGIN;

-- Последовательности: integer → bigint
ALTER SEQUENCE IF EXISTS public.operations_id_seq AS BIGINT;
ALTER SEQUENCE IF EXISTS public.ozon_daily_shipments_id_seq AS BIGINT;
ALTER SEQUENCE IF EXISTS public.ozon_fbo_supplies_id_seq AS BIGINT;
ALTER SEQUENCE IF EXISTS public.ozon_fbo_supply_items_id_seq AS BIGINT;
ALTER SEQUENCE IF EXISTS public.ozon_order_import_batches_id_seq AS BIGINT;
ALTER SEQUENCE IF EXISTS public.ozon_posting_items_id_seq AS BIGINT;
ALTER SEQUENCE IF EXISTS public.ozon_postings_id_seq AS BIGINT;
ALTER SEQUENCE IF EXISTS public.product_fields_id_seq AS BIGINT;
ALTER SEQUENCE IF EXISTS public.products_id_seq AS BIGINT;
ALTER SEQUENCE IF EXISTS public.user_settings_id_seq AS BIGINT;
ALTER SEQUENCE IF EXISTS public.writeoffs_id_seq AS BIGINT;

-- Колонки id: integer → bigint
ALTER TABLE public.products
    ALTER COLUMN id TYPE BIGINT;
ALTER TABLE public.product_fields
    ALTER COLUMN id TYPE BIGINT;
ALTER TABLE public.user_settings
    ALTER COLUMN id TYPE BIGINT;
ALTER TABLE public.operations
    ALTER COLUMN id TYPE BIGINT,
    ALTER COLUMN ozon_posting_id TYPE BIGINT;
ALTER TABLE public.writeoffs
    ALTER COLUMN id TYPE BIGINT,
    ALTER COLUMN product_id TYPE BIGINT,
    ALTER COLUMN operation_id TYPE BIGINT;
ALTER TABLE public.ozon_postings
    ALTER COLUMN id TYPE BIGINT,
    ALTER COLUMN shipment_operation_id TYPE BIGINT;
ALTER TABLE public.ozon_posting_items
    ALTER COLUMN id TYPE BIGINT,
    ALTER COLUMN posting_id TYPE BIGINT,
    ALTER COLUMN product_id TYPE BIGINT;
ALTER TABLE public.ozon_daily_shipments
    ALTER COLUMN id TYPE BIGINT,
    ALTER COLUMN shipment_id TYPE BIGINT;
ALTER TABLE public.ozon_fbo_supplies
    ALTER COLUMN id TYPE BIGINT,
    ALTER COLUMN shipment_operation_id TYPE BIGINT;
ALTER TABLE public.ozon_fbo_supply_items
    ALTER COLUMN id TYPE BIGINT,
    ALTER COLUMN supply_id TYPE BIGINT,
    ALTER COLUMN product_id TYPE BIGINT;
ALTER TABLE public.ozon_order_import_batches
    ALTER COLUMN id TYPE BIGINT;
ALTER TABLE public.ozon_order_lines
    ALTER COLUMN batch_id TYPE BIGINT,
    ALTER COLUMN product_id TYPE BIGINT;

COMMIT;
