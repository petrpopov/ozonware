ALTER TABLE products
    ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX idx_products_is_active ON products(is_active) WHERE is_active = FALSE;

COMMENT ON COLUMN products.is_active IS
    'TRUE — товар виден на /products. FALSE — только в справочнике /catalog. Автоматически становится TRUE при первом приходе или поставке.';
