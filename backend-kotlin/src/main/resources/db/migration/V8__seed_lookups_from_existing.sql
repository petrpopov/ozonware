-- V8: Заполнение lookup-таблиц из существующих данных.

-- Статусы постингов FBS из реальных данных
INSERT INTO ozon_posting_statuses(code, label)
SELECT DISTINCT status, status
FROM ozon_postings
WHERE status IS NOT NULL
ON CONFLICT DO NOTHING;

UPDATE ozon_posting_statuses SET label = 'Ожидает отгрузки'                        WHERE code = 'awaiting_deliver';
UPDATE ozon_posting_statuses SET label = 'В доставке'                               WHERE code = 'delivering';
UPDATE ozon_posting_statuses SET label = 'Доставлено',   is_terminal = TRUE          WHERE code = 'delivered';
UPDATE ozon_posting_statuses SET label = 'Отменено',     is_terminal = TRUE,
    csv_aliases = '{canceled,отменён,отменен}'                                        WHERE code = 'cancelled';
-- canceled нормализуем в cancelled при записи; отдельную строку не создаём

-- Статусы поставок FBO
INSERT INTO ozon_supply_states(code, label)
SELECT DISTINCT state, state
FROM ozon_fbo_supplies
WHERE state IS NOT NULL
ON CONFLICT DO NOTHING;

UPDATE ozon_supply_states SET label = 'Завершено',            is_terminal = TRUE WHERE code = 'COMPLETED';
UPDATE ozon_supply_states SET label = 'Принято на складе'                         WHERE code = 'ACCEPTED_AT_SUPPLY_WAREHOUSE';

-- Склады из текстовых полей ozon_fbo_supplies
INSERT INTO warehouses(ozon_warehouse_id, name, address)
SELECT DISTINCT warehouse_id, warehouse_name, warehouse_address
FROM ozon_fbo_supplies
WHERE warehouse_id IS NOT NULL
ON CONFLICT (ozon_warehouse_id) DO NOTHING;
