-- V7: Создание lookup-таблиц для нормализации схемы.
-- Ни один enum PostgreSQL не используется — только VARCHAR PK или BIGSERIAL PK.

CREATE TABLE operation_types (
    code          VARCHAR(32) PRIMARY KEY,
    label         TEXT        NOT NULL,
    affects_stock_sign INTEGER NOT NULL,  -- +1 / -1 / 0
    position      INTEGER     NOT NULL DEFAULT 0
);
INSERT INTO operation_types(code, label, affects_stock_sign, position) VALUES
    ('receipt',     'Приёмка',          1,  10),
    ('shipment',    'Отгрузка',        -1,  20),
    ('inventory',   'Инвентаризация',   0,  30),
    ('writeoff',    'Списание',        -1,  40),
    ('correction',  'Корректировка',    0,  50);

CREATE TABLE operation_channels (
    code  VARCHAR(32) PRIMARY KEY,
    label TEXT        NOT NULL
);
INSERT INTO operation_channels(code, label) VALUES
    ('manual',   'Ручная'),
    ('ozon_fbs', 'OZON FBS'),
    ('ozon_fbo', 'OZON FBO');

CREATE TABLE writeoff_reasons (
    id            BIGINT GENERATED ALWAYS AS IDENTITY NOT NULL PRIMARY KEY,
    code          VARCHAR(32) UNIQUE NOT NULL,
    label         TEXT        NOT NULL,
    affects_stock BOOLEAN     NOT NULL DEFAULT TRUE,
    is_system     BOOLEAN     NOT NULL DEFAULT FALSE,
    position      INTEGER     NOT NULL DEFAULT 0
);
INSERT INTO writeoff_reasons(code, label, affects_stock, is_system, position) VALUES
    ('defect', 'Брак',              TRUE, TRUE, 10),
    ('loss',   'Потеря/недостача',  TRUE, TRUE, 20),
    ('reserve','Резерв',            FALSE,TRUE, 30);

CREATE TABLE correction_reasons (
    id        BIGINT GENERATED ALWAYS AS IDENTITY NOT NULL PRIMARY KEY,
    code      VARCHAR(48) UNIQUE NOT NULL,
    label     TEXT        NOT NULL,
    is_system BOOLEAN     NOT NULL DEFAULT FALSE,
    position  INTEGER     NOT NULL DEFAULT 0
);
INSERT INTO correction_reasons(code, label, is_system, position) VALUES
    ('post_shipment', 'Корректировка после отгрузки', TRUE,  10),
    ('manual',        'Ручная правка остатка',        TRUE,  20);

CREATE TABLE product_field_types (
    code    VARCHAR(32) PRIMARY KEY,
    label   TEXT        NOT NULL,
    widget  VARCHAR(32) NOT NULL,
    stores  VARCHAR(16) NOT NULL   -- 'text'|'number'|'color'|'image'|'option'
);
INSERT INTO product_field_types(code, label, widget, stores) VALUES
    ('barcode', 'Штрих-код',          'text',   'text'),
    ('text',    'Текст',              'text',   'text'),
    ('number',  'Число',              'number', 'number'),
    ('color',   'Цвет',               'color',  'color'),
    ('image',   'Изображение',        'image',  'text'),
    ('select',  'Выпадающий список',  'select', 'option');

CREATE TABLE ozon_posting_statuses (
    code        VARCHAR(48) PRIMARY KEY,
    label       TEXT        NOT NULL,
    is_terminal BOOLEAN     NOT NULL DEFAULT FALSE,
    csv_aliases TEXT[]      NOT NULL DEFAULT '{}'
);

CREATE TABLE ozon_supply_states (
    code        VARCHAR(48) PRIMARY KEY,
    label       TEXT        NOT NULL,
    is_terminal BOOLEAN     NOT NULL DEFAULT FALSE
);

CREATE TABLE warehouses (
    id                 BIGINT GENERATED ALWAYS AS IDENTITY NOT NULL PRIMARY KEY,
    ozon_warehouse_id  BIGINT UNIQUE,
    name               TEXT   NOT NULL,
    address            TEXT,
    created_at         TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'UTC'),
    updated_at         TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')
);
CREATE TRIGGER warehouses_updated_at
    BEFORE UPDATE ON warehouses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
