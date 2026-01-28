-- Инициализация базы данных OpenWS (Open Warehouse System)
-- База данных создается через POSTGRES_DB в docker-compose

-- Таблица настроек полей товаров
CREATE TABLE IF NOT EXISTS product_fields (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('barcode', 'text', 'number', 'image', 'select')),
    required BOOLEAN DEFAULT FALSE,
    show_in_table BOOLEAN DEFAULT TRUE,
    options JSONB DEFAULT '[]',
    position INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Таблица товаров
CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    sku VARCHAR(100) UNIQUE NOT NULL,
    quantity INTEGER DEFAULT 0 CHECK (quantity >= 0),
    description TEXT,
    custom_fields JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Таблица операций (приходы, отгрузки, инвентаризация)
CREATE TABLE IF NOT EXISTS operations (
    id SERIAL PRIMARY KEY,
    type VARCHAR(50) NOT NULL CHECK (type IN ('receipt', 'shipment', 'inventory', 'writeoff')),
    operation_date DATE,
    note TEXT,
    items JSONB DEFAULT '[]',
    total_quantity INTEGER DEFAULT 0,
    differences JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Таблица списаний товаров (брак, потери, резерв)
CREATE TABLE IF NOT EXISTS writeoffs (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    operation_id INTEGER REFERENCES operations(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    reason VARCHAR(50) NOT NULL CHECK (reason IN ('defect', 'loss', 'reserve')),
    note TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Таблица настроек порядка колонок
CREATE TABLE IF NOT EXISTS user_settings (
    id SERIAL PRIMARY KEY,
    user_id INTEGER DEFAULT 1,
    setting_key VARCHAR(100) NOT NULL,
    setting_value JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, setting_key)
);

-- Индексы для производительности
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
CREATE INDEX IF NOT EXISTS idx_operations_type ON operations(type);
CREATE INDEX IF NOT EXISTS idx_operations_date ON operations(operation_date);
CREATE INDEX IF NOT EXISTS idx_operations_created ON operations(created_at);

-- Функция для автоматического обновления updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Триггеры для автоматического обновления updated_at
CREATE TRIGGER update_product_fields_updated_at BEFORE UPDATE ON product_fields
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_operations_updated_at BEFORE UPDATE ON operations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_settings_updated_at BEFORE UPDATE ON user_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Вставка дефолтного поля штрихкода
INSERT INTO product_fields (name, type, required, show_in_table, position)
VALUES ('Штрихкод', 'barcode', false, true, 0)
ON CONFLICT DO NOTHING;

-- Вставка дефолтных настроек порядка колонок
INSERT INTO user_settings (user_id, setting_key, setting_value)
VALUES (1, 'columns_order', '["#", "name", "sku", "Штрихкод", "quantity", "actions"]'::jsonb)
ON CONFLICT (user_id, setting_key) DO NOTHING;

-- Комментарии к таблицам
COMMENT ON TABLE product_fields IS 'Настройки кастомных полей для товаров';
COMMENT ON TABLE products IS 'Товары на складе';
COMMENT ON TABLE operations IS 'Операции прихода, отгрузки и инвентаризации';
COMMENT ON TABLE user_settings IS 'Пользовательские настройки интерфейса';

COMMENT ON COLUMN product_fields.options IS 'JSON массив опций для типа select';
COMMENT ON COLUMN products.custom_fields IS 'JSON массив значений кастомных полей';
COMMENT ON COLUMN operations.items IS 'JSON массив товаров в операции';
COMMENT ON COLUMN operations.differences IS 'JSON массив расхождений при инвентаризации';
