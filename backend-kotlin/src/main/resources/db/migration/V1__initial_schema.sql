-- V1: Initial schema baseline
-- Использует CREATE TABLE IF NOT EXISTS — безопасна для существующей БД
-- На чистой БД создаёт полную схему

-- ── Function ──
CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- ── Tables ──

CREATE TABLE IF NOT EXISTS public.products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    sku VARCHAR(100) UNIQUE NOT NULL,
    quantity INTEGER DEFAULT 0 CHECK (quantity >= 0),
    description TEXT,
    custom_fields JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.product_fields (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('barcode', 'text', 'number', 'color', 'image', 'select')),
    required BOOLEAN DEFAULT FALSE,
    show_in_table BOOLEAN DEFAULT TRUE,
    options JSONB DEFAULT '[]',
    position INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.user_settings (
    id SERIAL PRIMARY KEY,
    user_id INTEGER DEFAULT 1,
    setting_key VARCHAR(100) NOT NULL,
    setting_value JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS user_settings_user_id_setting_key_key ON public.user_settings (user_id, setting_key);
CREATE UNIQUE INDEX IF NOT EXISTS unique_setting_key ON public.user_settings (setting_key);

CREATE TABLE IF NOT EXISTS public.operations (
    id SERIAL PRIMARY KEY,
    type VARCHAR(50) NOT NULL CHECK (type IN ('receipt', 'shipment', 'inventory', 'writeoff', 'correction')),
    operation_date DATE,
    note TEXT,
    items JSONB DEFAULT '[]',
    total_quantity INTEGER DEFAULT 0,
    differences JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ozon_posting_id BIGINT
);

CREATE TABLE IF NOT EXISTS public.writeoffs (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    operation_id INTEGER REFERENCES public.operations(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    reason VARCHAR(50) NOT NULL CHECK (reason IN ('defect', 'loss', 'reserve')),
    note TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.ozon_postings (
    id SERIAL PRIMARY KEY,
    posting_number VARCHAR(255) NOT NULL UNIQUE,
    order_number VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL,
    in_process_at TIMESTAMP NOT NULL,
    raw_data JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    shipped BOOLEAN DEFAULT FALSE NOT NULL,
    shipment_applied BOOLEAN DEFAULT FALSE,
    shipment_operation_id INTEGER
);

CREATE TABLE IF NOT EXISTS public.ozon_posting_items (
    id SERIAL PRIMARY KEY,
    posting_id INTEGER NOT NULL REFERENCES public.ozon_postings(id) ON DELETE CASCADE,
    ozon_sku VARCHAR(250) NOT NULL,
    product_id INTEGER REFERENCES public.products(id) ON DELETE SET NULL,
    quantity INTEGER NOT NULL,
    product_name VARCHAR(500),
    offer_id VARCHAR(250) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ozon_daily_shipments (
    id SERIAL PRIMARY KEY,
    delivery_day DATE NOT NULL UNIQUE,
    shipment_id INTEGER REFERENCES public.operations(id) ON DELETE SET NULL,
    total_postings INTEGER DEFAULT 0,
    total_items INTEGER DEFAULT 0,
    is_applied BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ozon_fbo_supplies (
    id SERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL,
    order_number TEXT,
    state TEXT,
    order_created_date TIMESTAMPTZ,
    state_updated_date TIMESTAMPTZ,
    supply_id BIGINT,
    bundle_id TEXT NOT NULL UNIQUE,
    arrival_date TIMESTAMPTZ,
    warehouse_id BIGINT,
    warehouse_name TEXT,
    warehouse_address TEXT,
    raw_order JSONB,
    raw_supply JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    shipment_applied BOOLEAN DEFAULT FALSE,
    shipment_operation_id INTEGER
);

CREATE TABLE IF NOT EXISTS public.ozon_fbo_supply_items (
    id SERIAL PRIMARY KEY,
    supply_id INTEGER NOT NULL REFERENCES public.ozon_fbo_supplies(id) ON DELETE CASCADE,
    ozon_sku TEXT NOT NULL,
    product_id INTEGER REFERENCES public.products(id),
    quantity INTEGER DEFAULT 0 NOT NULL,
    product_name TEXT,
    offer_id TEXT,
    icon_path TEXT,
    raw_item JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ozon_order_import_batches (
    id SERIAL PRIMARY KEY,
    source VARCHAR(32) NOT NULL,
    file_name TEXT,
    imported_at TIMESTAMP DEFAULT NOW() NOT NULL,
    rows_total INTEGER DEFAULT 0 NOT NULL,
    rows_saved INTEGER DEFAULT 0 NOT NULL,
    rows_updated INTEGER DEFAULT 0 NOT NULL,
    rows_skipped INTEGER DEFAULT 0 NOT NULL,
    rows_unmatched INTEGER DEFAULT 0 NOT NULL,
    summary JSONB DEFAULT '{}' NOT NULL,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.ozon_order_lines (
    id BIGSERIAL PRIMARY KEY,
    external_line_key TEXT NOT NULL UNIQUE,
    batch_id INTEGER REFERENCES public.ozon_order_import_batches(id) ON DELETE SET NULL,
    source VARCHAR(32) NOT NULL,
    order_number TEXT,
    posting_number TEXT NOT NULL,
    accepted_at TIMESTAMP,
    shipment_date TIMESTAMP,
    shipment_deadline TIMESTAMP,
    transfer_at TIMESTAMP,
    delivery_date TIMESTAMP,
    cancellation_date TIMESTAMP,
    status TEXT,
    product_name TEXT,
    ozon_sku TEXT,
    offer_id TEXT,
    quantity INTEGER DEFAULT 0 NOT NULL,
    your_price NUMERIC(14, 2),
    paid_by_customer NUMERIC(14, 2),
    shipment_amount NUMERIC(14, 2),
    currency TEXT,
    discount_percent TEXT,
    discount_rub NUMERIC(14, 2),
    shipping_cost NUMERIC(14, 2),
    promotions TEXT,
    volumetric_weight_kg NUMERIC(10, 3),
    product_id INTEGER REFERENCES public.products(id) ON DELETE SET NULL,
    matched_by TEXT,
    raw JSONB DEFAULT '{}' NOT NULL,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- ── Indexes ──

CREATE INDEX IF NOT EXISTS idx_products_name ON public.products (name);
CREATE INDEX IF NOT EXISTS idx_products_sku ON public.products (sku);
CREATE INDEX IF NOT EXISTS idx_operations_created ON public.operations (created_at);
CREATE INDEX IF NOT EXISTS idx_operations_date ON public.operations (operation_date);
CREATE INDEX IF NOT EXISTS idx_operations_type ON public.operations (type);
CREATE INDEX IF NOT EXISTS idx_ozon_postings_posting_number ON public.ozon_postings (posting_number);
CREATE INDEX IF NOT EXISTS idx_ozon_postings_status ON public.ozon_postings (status);
CREATE INDEX IF NOT EXISTS idx_ozon_posting_items_posting_id ON public.ozon_posting_items (posting_id);
CREATE INDEX IF NOT EXISTS idx_ozon_posting_items_product_id ON public.ozon_posting_items (product_id);
CREATE INDEX IF NOT EXISTS idx_ozon_posting_items_ozon_sku ON public.ozon_posting_items (ozon_sku);
CREATE INDEX IF NOT EXISTS idx_ozon_daily_shipments_delivery_day ON public.ozon_daily_shipments (delivery_day);
CREATE INDEX IF NOT EXISTS idx_ozon_daily_shipments_shipment_id ON public.ozon_daily_shipments (shipment_id);
CREATE INDEX IF NOT EXISTS idx_ozon_fbo_supplies_arrival_date ON public.ozon_fbo_supplies (arrival_date);
CREATE INDEX IF NOT EXISTS idx_ozon_fbo_supply_items_supply_id ON public.ozon_fbo_supply_items (supply_id);
CREATE INDEX IF NOT EXISTS idx_ozon_order_lines_accepted_at ON public.ozon_order_lines (accepted_at DESC);
CREATE INDEX IF NOT EXISTS idx_ozon_order_lines_posting_number ON public.ozon_order_lines (posting_number);
CREATE INDEX IF NOT EXISTS idx_ozon_order_lines_product_id ON public.ozon_order_lines (product_id);
CREATE INDEX IF NOT EXISTS idx_ozon_order_lines_source ON public.ozon_order_lines (source);

-- ── Triggers ──

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_products_updated_at') THEN
        CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_product_fields_updated_at') THEN
        CREATE TRIGGER update_product_fields_updated_at BEFORE UPDATE ON public.product_fields FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_user_settings_updated_at') THEN
        CREATE TRIGGER update_user_settings_updated_at BEFORE UPDATE ON public.user_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_operations_updated_at') THEN
        CREATE TRIGGER update_operations_updated_at BEFORE UPDATE ON public.operations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_ozon_postings_updated_at') THEN
        CREATE TRIGGER update_ozon_postings_updated_at BEFORE UPDATE ON public.ozon_postings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_ozon_posting_items_updated_at') THEN
        CREATE TRIGGER update_ozon_posting_items_updated_at BEFORE UPDATE ON public.ozon_posting_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_ozon_daily_shipments_updated_at') THEN
        CREATE TRIGGER update_ozon_daily_shipments_updated_at BEFORE UPDATE ON public.ozon_daily_shipments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
END;
$$;

-- ── FK (NOT VALID для existing data) ──

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'operations_ozon_posting_id_fkey') THEN
        ALTER TABLE ONLY public.operations
            ADD CONSTRAINT operations_ozon_posting_id_fkey FOREIGN KEY (ozon_posting_id)
            REFERENCES public.ozon_postings(id) NOT VALID;
    END IF;
END;
$$;
