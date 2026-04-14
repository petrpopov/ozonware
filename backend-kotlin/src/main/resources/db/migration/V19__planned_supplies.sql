-- V19: Planned supplies feature

-- 1. planned_supplies table
CREATE TABLE planned_supplies (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title           VARCHAR(255) NOT NULL,
    supplier        VARCHAR(255),
    planned_date    DATE,
    note            TEXT,
    source_file     VARCHAR(255),
    status          VARCHAR(32) NOT NULL DEFAULT 'planned',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT check_planned_supplies_status CHECK (status IN ('planned', 'partial', 'matched', 'closed'))
);

-- 2. planned_supply_items table
CREATE TABLE planned_supply_items (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    planned_supply_id   BIGINT NOT NULL REFERENCES planned_supplies(id) ON DELETE CASCADE,
    product_id          BIGINT REFERENCES products(id),
    sku                 VARCHAR(255) NOT NULL,
    product_name        VARCHAR(512),
    planned_quantity    INTEGER NOT NULL CHECK (planned_quantity > 0)
);

CREATE INDEX idx_planned_supply_items_supply ON planned_supply_items(planned_supply_id);
CREATE INDEX idx_planned_supply_items_product ON planned_supply_items(product_id);

-- 3. Alter operations table to add planned_supply_id
ALTER TABLE operations ADD COLUMN planned_supply_id BIGINT REFERENCES planned_supplies(id);
CREATE INDEX idx_operations_planned_supply ON operations(planned_supply_id);

-- 4. Add new operation_type for receipt_return
INSERT INTO operation_types(code, label, affects_stock_sign, position) VALUES
    ('receipt_return', 'Возврат поставщику', -1, 15);

-- 5. Add new correction_reasons
INSERT INTO correction_reasons(code, label, is_system, position) VALUES
    ('shortage_delivery', 'Недостача при поставке', TRUE, 30),
    ('excess_return', 'Возврат излишков поставщику', TRUE, 40);
