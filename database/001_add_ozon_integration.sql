-- Миграция: Добавление поддержки OZON FBS интеграции
-- Дата: 2026-02-06
-- Описание: Добавляет настройки OZON в user_settings и таблицы для хранения заказов OZON

-- 1. Добавляем настройки OZON в user_settings (если их еще нет)
-- Используем существующую таблицу user_settings для хранения конфигурации OZON
DO $$
BEGIN
    -- Проверяем существует ли запись с ключом ozon_settings
    IF NOT EXISTS (SELECT 1 FROM user_settings WHERE key = 'ozon_settings') THEN
        INSERT INTO user_settings (key, value, created_at, updated_at)
        VALUES (
            'ozon_settings',
            '{"clientId": "", "apiKey": "", "syncStartDate": "2026-01-01T00:00:00+03:00"}'::jsonb,
            NOW(),
            NOW()
        );
    END IF;
END $$;

-- 2. Создаем таблицу для хранения заказов OZON
CREATE TABLE IF NOT EXISTS ozon_postings (
    id SERIAL PRIMARY KEY,
    posting_number VARCHAR(255) UNIQUE NOT NULL,  -- Уникальный номер отправления
    order_number VARCHAR(255) NOT NULL,           -- Номер заказа
    status VARCHAR(50) NOT NULL,                  -- Статус: awaiting_deliver, delivering, delivered
    delivering_date_utc TIMESTAMP NOT NULL,       -- Дата доставки в UTC
    delivering_date_moscow TIMESTAMP NOT NULL,    -- Дата доставки по Москве (UTC+3)
    delivery_day DATE NOT NULL,                   -- День доставки (для группировки)
    raw_data JSONB,                               -- Полные данные от OZON API
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_ozon_postings_posting_number ON ozon_postings(posting_number);
CREATE INDEX IF NOT EXISTS idx_ozon_postings_delivery_day ON ozon_postings(delivery_day);
CREATE INDEX IF NOT EXISTS idx_ozon_postings_status ON ozon_postings(status);

-- 3. Создаем таблицу для товаров в заказах OZON
CREATE TABLE IF NOT EXISTS ozon_posting_items (
    id SERIAL PRIMARY KEY,
    posting_id INTEGER NOT NULL REFERENCES ozon_postings(id) ON DELETE CASCADE,
    ozon_sku BIGINT NOT NULL,                     -- SKU товара в OZON
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,  -- Связь с нашим товаром
    quantity INTEGER NOT NULL,                     -- Количество
    product_name VARCHAR(500),                     -- Название товара из OZON (на случай если не найден)
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Индексы
CREATE INDEX IF NOT EXISTS idx_ozon_posting_items_posting_id ON ozon_posting_items(posting_id);
CREATE INDEX IF NOT EXISTS idx_ozon_posting_items_ozon_sku ON ozon_posting_items(ozon_sku);
CREATE INDEX IF NOT EXISTS idx_ozon_posting_items_product_id ON ozon_posting_items(product_id);

-- 4. Создаем таблицу для связи дневных отгрузок OZON с нашими отгрузками
CREATE TABLE IF NOT EXISTS ozon_daily_shipments (
    id SERIAL PRIMARY KEY,
    delivery_day DATE NOT NULL UNIQUE,            -- День отгрузки
    shipment_id INTEGER REFERENCES shipments(id) ON DELETE SET NULL,  -- Связь с созданной отгрузкой
    total_postings INTEGER DEFAULT 0,             -- Количество заказов
    total_items INTEGER DEFAULT 0,                -- Количество позиций
    is_applied BOOLEAN DEFAULT FALSE,             -- Применена ли отгрузка к остаткам
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Индекс
CREATE INDEX IF NOT EXISTS idx_ozon_daily_shipments_delivery_day ON ozon_daily_shipments(delivery_day);
CREATE INDEX IF NOT EXISTS idx_ozon_daily_shipments_shipment_id ON ozon_daily_shipments(shipment_id);

-- 5. Добавляем триггер для автоматического обновления updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Применяем триггеры
DROP TRIGGER IF EXISTS update_ozon_postings_updated_at ON ozon_postings;
CREATE TRIGGER update_ozon_postings_updated_at
    BEFORE UPDATE ON ozon_postings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_ozon_posting_items_updated_at ON ozon_posting_items;
CREATE TRIGGER update_ozon_posting_items_updated_at
    BEFORE UPDATE ON ozon_posting_items
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_ozon_daily_shipments_updated_at ON ozon_daily_shipments;
CREATE TRIGGER update_ozon_daily_shipments_updated_at
    BEFORE UPDATE ON ozon_daily_shipments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Готово!
-- Для отката миграции используйте: migrations/001_rollback_ozon_integration.sql
