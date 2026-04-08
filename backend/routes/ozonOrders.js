const express = require('express');
const router = express.Router();
const pool = require('../db');

let schemaReady = false;

async function ensureSchema() {
    if (schemaReady) return;
    await pool.query(`
        CREATE TABLE IF NOT EXISTS ozon_order_import_batches (
            id SERIAL PRIMARY KEY,
            source VARCHAR(32) NOT NULL,
            file_name TEXT,
            imported_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
            rows_total INTEGER NOT NULL DEFAULT 0,
            rows_saved INTEGER NOT NULL DEFAULT 0,
            rows_updated INTEGER NOT NULL DEFAULT 0,
            rows_skipped INTEGER NOT NULL DEFAULT 0,
            rows_unmatched INTEGER NOT NULL DEFAULT 0,
            summary JSONB NOT NULL DEFAULT '{}'::jsonb
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS ozon_order_lines (
            id BIGSERIAL PRIMARY KEY,
            external_line_key TEXT NOT NULL UNIQUE,
            batch_id INTEGER REFERENCES ozon_order_import_batches(id) ON DELETE SET NULL,
            source VARCHAR(32) NOT NULL,
            order_number TEXT,
            posting_number TEXT NOT NULL,
            accepted_at TIMESTAMP WITHOUT TIME ZONE,
            shipment_date TIMESTAMP WITHOUT TIME ZONE,
            shipment_deadline TIMESTAMP WITHOUT TIME ZONE,
            transfer_at TIMESTAMP WITHOUT TIME ZONE,
            delivery_date TIMESTAMP WITHOUT TIME ZONE,
            cancellation_date TIMESTAMP WITHOUT TIME ZONE,
            status TEXT,
            product_name TEXT,
            ozon_sku TEXT,
            offer_id TEXT,
            quantity INTEGER NOT NULL DEFAULT 0,
            your_price NUMERIC(14,2),
            paid_by_customer NUMERIC(14,2),
            shipment_amount NUMERIC(14,2),
            currency TEXT,
            discount_percent TEXT,
            discount_rub NUMERIC(14,2),
            shipping_cost NUMERIC(14,2),
            promotions TEXT,
            volumetric_weight_kg NUMERIC(10,3),
            product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
            matched_by TEXT,
            raw JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
        )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_ozon_order_lines_product_id ON ozon_order_lines(product_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_ozon_order_lines_source ON ozon_order_lines(source)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_ozon_order_lines_accepted_at ON ozon_order_lines(accepted_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_ozon_order_lines_posting_number ON ozon_order_lines(posting_number)`);
    schemaReady = true;
}

function str(value) {
    return String(value ?? '').trim();
}

function getCell(row, ...keys) {
    for (const key of keys) {
        if (Object.prototype.hasOwnProperty.call(row, key)) {
            return str(row[key]);
        }
    }
    return '';
}

function normalizeStatus(value) {
    return str(value).toLowerCase();
}

function parseDecimal(value) {
    const raw = str(value).replace(/\s+/g, '').replace(',', '.');
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
}

function parseInteger(value) {
    const n = parseDecimal(value);
    if (!Number.isFinite(n)) return null;
    const i = Math.round(n);
    return Number.isFinite(i) ? i : null;
}

function parseDateTime(value) {
    const raw = str(value);
    if (!raw) return null;
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (!m) return null;
    const hh = m[4] || '00';
    const mm = m[5] || '00';
    const ss = m[6] || '00';
    return `${m[1]}-${m[2]}-${m[3]} ${hh}:${mm}:${ss}`;
}

function normalizeOffer(value) {
    return str(value).toLowerCase();
}

function normalizeOzonSku(value) {
    const raw = str(value).replace(/^ozn/i, '');
    return raw.replace(/\s+/g, '');
}

async function buildProductLookup() {
    const result = await pool.query(`SELECT id, sku, name, custom_fields FROM products`);
    const byOffer = new Map();
    const byOzonSku = new Map();
    const bySku = new Map();

    for (const product of result.rows) {
        bySku.set(str(product.sku).toLowerCase(), product);
        const fields = Array.isArray(product.custom_fields) ? product.custom_fields : [];
        for (const field of fields) {
            const fieldName = str(field?.name).toLowerCase();
            const fieldValue = str(field?.value);
            if (!fieldValue) continue;
            if (fieldName === 'артикул ozon') {
                byOffer.set(normalizeOffer(fieldValue), product);
            }
            if (fieldName === 'ozon') {
                byOzonSku.set(normalizeOzonSku(fieldValue), product);
            }
        }
    }

    return { byOffer, byOzonSku, bySku };
}

function buildExternalKey(source, line) {
    return [
        source,
        str(line.posting_number),
        normalizeOffer(line.offer_id),
        normalizeOzonSku(line.ozon_sku),
        str(line.accepted_at),
        str(line.order_number)
    ].join('|');
}

function getOperationLineForProduct(operation, productId) {
    const items = Array.isArray(operation.items) ? operation.items : [];
    const differences = Array.isArray(operation.differences) ? operation.differences : [];

    if (operation.type === 'receipt') {
        const qty = items
            .filter((it) => Number(it?.productId) === productId)
            .reduce((sum, it) => sum + Number(it?.quantity || 0), 0);
        if (qty) return { qtyChange: qty, details: `Приход: +${qty}` };
    }

    if (operation.type === 'shipment') {
        const qty = items
            .filter((it) => Number(it?.productId) === productId)
            .reduce((sum, it) => sum + Number(it?.appliedQuantity ?? it?.quantity ?? 0), 0);
        if (qty) return { qtyChange: -qty, details: `Отгрузка: -${qty}` };
    }

    if (operation.type === 'writeoff') {
        const qty = items
            .filter((it) => Number(it?.productId) === productId)
            .reduce((sum, it) => sum + Number(it?.quantity || 0), 0);
        if (qty) return { qtyChange: -qty, details: `Списание: -${qty}` };
    }

    if (operation.type === 'correction') {
        const withDelta = items.filter((it) => Number(it?.productId) === productId && Number.isFinite(Number(it?.delta)));
        if (withDelta.length) {
            const delta = withDelta.reduce((sum, it) => sum + Number(it.delta || 0), 0);
            if (delta) return { qtyChange: delta, details: `Корректировка: ${delta > 0 ? '+' : ''}${delta}` };
        }
        const diffDelta = differences
            .filter((df) => Number(df?.productId) === productId)
            .reduce((sum, df) => sum + Number(df?.correctionDelta || 0), 0);
        if (diffDelta) return { qtyChange: diffDelta, details: `Корректировка: ${diffDelta > 0 ? '+' : ''}${diffDelta}` };
    }

    if (operation.type === 'inventory') {
        const delta = differences
            .filter((df) => Number(df?.productId) === productId)
            .reduce((sum, df) => sum + Number(df?.difference || 0), 0);
        if (delta) return { qtyChange: delta, details: `Инвентаризация: ${delta > 0 ? '+' : ''}${delta}` };
    }

    return null;
}

router.get('/imports', async (req, res) => {
    try {
        await ensureSchema();
        const limit = Math.max(1, Math.min(200, Number(req.query.limit || 20)));
        const result = await pool.query(
            `SELECT id, source, file_name, imported_at, rows_total, rows_saved, rows_updated, rows_skipped, rows_unmatched, summary
             FROM ozon_order_import_batches
             ORDER BY imported_at DESC, id DESC
             LIMIT $1`,
            [limit]
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching ozon imports:', error);
        res.status(500).json({ error: 'Failed to fetch ozon imports' });
    }
});

router.post('/import', async (req, res) => {
    const source = str(req.body?.source);
    const fileName = str(req.body?.file_name);
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!['fbs_csv', 'fbo_csv'].includes(source)) {
        return res.status(400).json({ error: 'Invalid source. Use fbs_csv or fbo_csv' });
    }
    if (!rows.length) {
        return res.status(400).json({ error: 'rows array is required' });
    }

    const client = await pool.connect();
    try {
        await ensureSchema();
        await client.query('BEGIN');
        const batchResult = await client.query(
            `INSERT INTO ozon_order_import_batches (source, file_name, rows_total)
             VALUES ($1, $2, $3)
             RETURNING id`,
            [source, fileName || null, rows.length]
        );
        const batchId = batchResult.rows[0].id;

        const lookup = await buildProductLookup();
        const summary = {
            total: rows.length,
            saved: 0,
            updated: 0,
            skipped: 0,
            unmatched: 0
        };

        for (const rawRow of rows) {
            const row = rawRow && typeof rawRow === 'object' ? rawRow : {};
            const status = getCell(row, 'Статус');
            const statusNorm = normalizeStatus(status);
            const transferAt = parseDateTime(getCell(row, 'Фактическая дата передачи в доставку'));
            if ((statusNorm === 'отменён' || statusNorm === 'отменен') && !transferAt) {
                summary.skipped += 1;
                continue;
            }

            const quantity = parseInteger(getCell(row, 'Количество'));
            const postingNumber = getCell(row, 'Номер отправления');
            const offerId = getCell(row, 'Артикул');
            const ozonSku = getCell(row, 'SKU');
            if (!postingNumber || !quantity || quantity <= 0) {
                summary.skipped += 1;
                continue;
            }

            let matchedProduct = null;
            let matchedBy = null;
            if (offerId && lookup.byOffer.has(normalizeOffer(offerId))) {
                matchedProduct = lookup.byOffer.get(normalizeOffer(offerId));
                matchedBy = 'offer_id';
            } else if (ozonSku && lookup.byOzonSku.has(normalizeOzonSku(ozonSku))) {
                matchedProduct = lookup.byOzonSku.get(normalizeOzonSku(ozonSku));
                matchedBy = 'ozon_sku';
            } else if (ozonSku && lookup.bySku.has(str(ozonSku).toLowerCase())) {
                matchedProduct = lookup.bySku.get(str(ozonSku).toLowerCase());
                matchedBy = 'sku';
            }

            if (!matchedProduct) {
                summary.unmatched += 1;
            }

            const line = {
                order_number: getCell(row, 'Номер заказа'),
                posting_number: postingNumber,
                accepted_at: parseDateTime(getCell(row, 'Принят в обработку')),
                shipment_date: parseDateTime(getCell(row, 'Дата отгрузки')),
                shipment_deadline: parseDateTime(getCell(row, 'Дата отгрузки без просрочки')),
                transfer_at: transferAt,
                delivery_date: parseDateTime(getCell(row, 'Дата доставки')),
                cancellation_date: parseDateTime(getCell(row, 'Дата отмены')),
                status,
                product_name: getCell(row, 'Название товара'),
                ozon_sku: ozonSku,
                offer_id: offerId,
                quantity,
                your_price: parseDecimal(getCell(row, 'Ваша цена')),
                paid_by_customer: parseDecimal(getCell(row, 'Оплачено покупателем')),
                shipment_amount: parseDecimal(getCell(row, 'Сумма отправления')),
                currency: getCell(row, 'Код валюты отправления', 'Код валюты товара'),
                discount_percent: getCell(row, 'Скидка %'),
                discount_rub: parseDecimal(getCell(row, 'Скидка руб')),
                shipping_cost: parseDecimal(getCell(row, 'Стоимость доставки')),
                promotions: getCell(row, 'Акции'),
                volumetric_weight_kg: parseDecimal(getCell(row, 'Объемный вес товаров, кг')),
                product_id: matchedProduct ? Number(matchedProduct.id) : null,
                matched_by: matchedBy
            };
            const externalKey = buildExternalKey(source, line);
            const upsert = await client.query(
                `INSERT INTO ozon_order_lines (
                    external_line_key, batch_id, source, order_number, posting_number, accepted_at,
                    shipment_date, shipment_deadline, transfer_at, delivery_date, cancellation_date,
                    status, product_name, ozon_sku, offer_id, quantity, your_price, paid_by_customer,
                    shipment_amount, currency, discount_percent, discount_rub, shipping_cost, promotions,
                    volumetric_weight_kg, product_id, matched_by, raw, updated_at
                 ) VALUES (
                    $1, $2, $3, $4, $5, $6,
                    $7, $8, $9, $10, $11,
                    $12, $13, $14, $15, $16, $17, $18,
                    $19, $20, $21, $22, $23, $24,
                    $25, $26, $27, $28::jsonb, NOW()
                 )
                 ON CONFLICT (external_line_key) DO UPDATE SET
                    batch_id = EXCLUDED.batch_id,
                    source = EXCLUDED.source,
                    order_number = EXCLUDED.order_number,
                    posting_number = EXCLUDED.posting_number,
                    accepted_at = EXCLUDED.accepted_at,
                    shipment_date = EXCLUDED.shipment_date,
                    shipment_deadline = EXCLUDED.shipment_deadline,
                    transfer_at = EXCLUDED.transfer_at,
                    delivery_date = EXCLUDED.delivery_date,
                    cancellation_date = EXCLUDED.cancellation_date,
                    status = EXCLUDED.status,
                    product_name = EXCLUDED.product_name,
                    ozon_sku = EXCLUDED.ozon_sku,
                    offer_id = EXCLUDED.offer_id,
                    quantity = EXCLUDED.quantity,
                    your_price = EXCLUDED.your_price,
                    paid_by_customer = EXCLUDED.paid_by_customer,
                    shipment_amount = EXCLUDED.shipment_amount,
                    currency = EXCLUDED.currency,
                    discount_percent = EXCLUDED.discount_percent,
                    discount_rub = EXCLUDED.discount_rub,
                    shipping_cost = EXCLUDED.shipping_cost,
                    promotions = EXCLUDED.promotions,
                    volumetric_weight_kg = EXCLUDED.volumetric_weight_kg,
                    product_id = EXCLUDED.product_id,
                    matched_by = EXCLUDED.matched_by,
                    raw = EXCLUDED.raw,
                    updated_at = NOW()
                 RETURNING (xmax = 0) AS inserted`,
                [
                    externalKey, batchId, source, line.order_number, line.posting_number, line.accepted_at,
                    line.shipment_date, line.shipment_deadline, line.transfer_at, line.delivery_date, line.cancellation_date,
                    line.status, line.product_name, line.ozon_sku, line.offer_id, line.quantity, line.your_price, line.paid_by_customer,
                    line.shipment_amount, line.currency, line.discount_percent, line.discount_rub, line.shipping_cost, line.promotions,
                    line.volumetric_weight_kg, line.product_id, line.matched_by, JSON.stringify(row)
                ]
            );
            if (upsert.rows[0]?.inserted) {
                summary.saved += 1;
            } else {
                summary.updated += 1;
            }
        }

        await client.query(
            `UPDATE ozon_order_import_batches
             SET rows_saved = $2,
                 rows_updated = $3,
                 rows_skipped = $4,
                 rows_unmatched = $5,
                 summary = $6::jsonb
             WHERE id = $1`,
            [batchId, summary.saved, summary.updated, summary.skipped, summary.unmatched, JSON.stringify(summary)]
        );

        await client.query('COMMIT');
        res.json({ batch_id: batchId, summary });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error importing ozon csv rows:', error);
        res.status(500).json({ error: 'Failed to import ozon CSV data' });
    } finally {
        client.release();
    }
});

router.get('/product/:id/stats', async (req, res) => {
    const productId = Number(req.params.id);
    if (!Number.isFinite(productId)) {
        return res.status(400).json({ error: 'Invalid product ID' });
    }
    try {
        await ensureSchema();
        const productResult = await pool.query(`SELECT id, name, sku, quantity FROM products WHERE id = $1`, [productId]);
        if (productResult.rows.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }

        const operationsResult = await pool.query(
            `SELECT id, type, operation_date, created_at, note, items, differences
             FROM operations
             WHERE EXISTS (
                 SELECT 1
                 FROM jsonb_array_elements(COALESCE(items, '[]'::jsonb)) AS item
                 WHERE (item ? 'productId')
                   AND (item->>'productId') ~ '^[0-9]+$'
                   AND (item->>'productId')::int = $1
             )
             OR EXISTS (
                 SELECT 1
                 FROM jsonb_array_elements(COALESCE(differences, '[]'::jsonb)) AS diff
                 WHERE (diff ? 'productId')
                   AND (diff->>'productId') ~ '^[0-9]+$'
                   AND (diff->>'productId')::int = $1
             )`,
            [productId]
        );

        const stats = {
            receipts_qty: 0,
            shipments_qty: 0,
            writeoffs_qty: 0,
            corrections_qty: 0,
            inventory_diff_qty: 0,
            last_movement_at: null
        };

        for (const op of operationsResult.rows) {
            const data = getOperationLineForProduct(op, productId);
            if (!data) continue;
            const dt = op.operation_date || op.created_at;
            if (!stats.last_movement_at || String(dt) > String(stats.last_movement_at)) {
                stats.last_movement_at = dt;
            }
            if (op.type === 'receipt') stats.receipts_qty += Math.abs(data.qtyChange || 0);
            if (op.type === 'shipment') stats.shipments_qty += Math.abs(data.qtyChange || 0);
            if (op.type === 'writeoff') stats.writeoffs_qty += Math.abs(data.qtyChange || 0);
            if (op.type === 'correction') stats.corrections_qty += Number(data.qtyChange || 0);
            if (op.type === 'inventory') stats.inventory_diff_qty += Number(data.qtyChange || 0);
        }

        const ordersResult = await pool.query(
            `SELECT source, status, quantity, your_price, paid_by_customer, posting_number, accepted_at, transfer_at, delivery_date
             FROM ozon_order_lines
             WHERE product_id = $1`,
            [productId]
        );

        const orderStats = {
            lines: ordersResult.rows.length,
            postings: new Set(),
            units_total: 0,
            units_canceled: 0,
            units_delivered: 0,
            units_transferred: 0,
            revenue_gross: 0,
            revenue_paid: 0,
            by_source: {
                fbs_csv: { units: 0, postings: new Set() },
                fbo_csv: { units: 0, postings: new Set() }
            }
        };

        for (const row of ordersResult.rows) {
            const qty = Number(row.quantity || 0);
            const status = normalizeStatus(row.status);
            orderStats.units_total += qty;
            if (row.posting_number) orderStats.postings.add(row.posting_number);
            if (status.includes('отмен')) orderStats.units_canceled += qty;
            if (status.includes('достав')) orderStats.units_delivered += qty;
            if (row.transfer_at) orderStats.units_transferred += qty;
            const yourPrice = Number(row.your_price || 0);
            const paid = Number(row.paid_by_customer || 0);
            orderStats.revenue_gross += yourPrice * qty;
            orderStats.revenue_paid += paid * qty;
            const src = row.source === 'fbo_csv' ? 'fbo_csv' : 'fbs_csv';
            orderStats.by_source[src].units += qty;
            if (row.posting_number) orderStats.by_source[src].postings.add(row.posting_number);
        }

        res.json({
            product: productResult.rows[0],
            warehouse: stats,
            orders: {
                lines: orderStats.lines,
                postings: orderStats.postings.size,
                units_total: orderStats.units_total,
                units_canceled: orderStats.units_canceled,
                units_delivered: orderStats.units_delivered,
                units_transferred: orderStats.units_transferred,
                revenue_gross: Number(orderStats.revenue_gross.toFixed(2)),
                revenue_paid: Number(orderStats.revenue_paid.toFixed(2)),
                by_source: {
                    fbs_csv: {
                        units: orderStats.by_source.fbs_csv.units,
                        postings: orderStats.by_source.fbs_csv.postings.size
                    },
                    fbo_csv: {
                        units: orderStats.by_source.fbo_csv.units,
                        postings: orderStats.by_source.fbo_csv.postings.size
                    }
                }
            }
        });
    } catch (error) {
        console.error('Error building product stats:', error);
        res.status(500).json({ error: 'Failed to build product stats' });
    }
});

router.get('/product/:id/timeline', async (req, res) => {
    const productId = Number(req.params.id);
    if (!Number.isFinite(productId)) {
        return res.status(400).json({ error: 'Invalid product ID' });
    }
    try {
        await ensureSchema();
        const all = String(req.query.all || '') === '1';
        const limit = all ? Number.MAX_SAFE_INTEGER : Math.max(1, Math.min(500, Number(req.query.limit || 200)));
        const offset = Math.max(0, Number(req.query.offset || 0));

        const operationsResult = await pool.query(
            `SELECT id, type, operation_date, created_at, note, items, differences
             FROM operations
             WHERE EXISTS (
                 SELECT 1
                 FROM jsonb_array_elements(COALESCE(items, '[]'::jsonb)) AS item
                 WHERE (item ? 'productId')
                   AND (item->>'productId') ~ '^[0-9]+$'
                   AND (item->>'productId')::int = $1
             )
             OR EXISTS (
                 SELECT 1
                 FROM jsonb_array_elements(COALESCE(differences, '[]'::jsonb)) AS diff
                 WHERE (diff ? 'productId')
                   AND (diff->>'productId') ~ '^[0-9]+$'
                   AND (diff->>'productId')::int = $1
             )`,
            [productId]
        );

        const movements = [];
        for (const op of operationsResult.rows) {
            const data = getOperationLineForProduct(op, productId);
            if (!data) continue;
            movements.push({
                kind: 'warehouse',
                event_type: op.type,
                event_time: op.operation_date || op.created_at,
                operation_id: op.id,
                quantity_change: Number(data.qtyChange || 0),
                quantity_abs: Math.abs(Number(data.qtyChange || 0)),
                details: data.details,
                note: op.note || ''
            });
        }

        const ordersResult = await pool.query(
            `SELECT id, source, order_number, posting_number, accepted_at, shipment_date, transfer_at, delivery_date,
                    status, quantity, your_price, paid_by_customer, offer_id, ozon_sku
             FROM ozon_order_lines
             WHERE product_id = $1`,
            [productId]
        );
        for (const row of ordersResult.rows) {
            movements.push({
                kind: 'ozon_order',
                event_type: 'order',
                event_time: row.accepted_at || row.shipment_date || row.transfer_at || row.delivery_date,
                source: row.source,
                order_line_id: row.id,
                order_number: row.order_number,
                posting_number: row.posting_number,
                status: row.status,
                quantity: Number(row.quantity || 0),
                your_price: Number(row.your_price || 0),
                paid_by_customer: Number(row.paid_by_customer || 0),
                offer_id: row.offer_id,
                ozon_sku: row.ozon_sku
            });
        }

        movements.sort((a, b) => String(b.event_time || '').localeCompare(String(a.event_time || '')));
        const total = movements.length;
        const items = all ? movements.slice(offset) : movements.slice(offset, offset + limit);
        res.json({ items, total, limit, offset });
    } catch (error) {
        console.error('Error building product timeline:', error);
        res.status(500).json({ error: 'Failed to build product timeline' });
    }
});

module.exports = router;
