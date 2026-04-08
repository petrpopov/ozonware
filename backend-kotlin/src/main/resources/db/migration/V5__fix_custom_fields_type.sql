-- V5: Fix custom_fields column type from bytea to jsonb
-- В существующей БД custom_fields мог быть bytea (Node.js pg driver)
-- Hibernate + hypersistence требует jsonb

DO $$
DECLARE
    col_type TEXT;
BEGIN
    -- Используем pg_catalog для надёжного определения типа
    SELECT t.typname INTO col_type
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_type t ON t.oid = a.atttypid
    WHERE n.nspname = 'public'
      AND c.relname = 'products'
      AND a.attname = 'custom_fields';

    RAISE NOTICE 'custom_fields type: %', col_type;

    IF col_type = 'bytea' THEN
        ALTER TABLE public.products ADD COLUMN custom_fields_new jsonb DEFAULT '[]';
        UPDATE public.products SET custom_fields_new = convert_from(custom_fields, 'UTF8')::jsonb;
        ALTER TABLE public.products DROP COLUMN custom_fields;
        ALTER TABLE public.products RENAME COLUMN custom_fields_new TO custom_fields;
        RAISE NOTICE 'Converted bytea to jsonb';
    ELSIF col_type IN ('text', 'varchar') THEN
        ALTER TABLE public.products
            ALTER COLUMN custom_fields TYPE jsonb USING custom_fields::jsonb;
        RAISE NOTICE 'Converted text to jsonb';
    ELSIF col_type = 'jsonb' THEN
        RAISE NOTICE 'Already jsonb, skipping';
    ELSE
        RAISE EXCEPTION 'Unknown type: %', col_type;
    END IF;
END $$;
