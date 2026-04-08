const express = require('express');
const router = express.Router();
const pool = require('../db');

async function tableExists(client, tableName) {
    const result = await client.query('SELECT to_regclass($1) AS reg', [`public.${tableName}`]);
    return Boolean(result.rows[0]?.reg);
}

async function ensureOperationsTypeConstraint(client) {
    const result = await client.query(
        `SELECT pg_get_constraintdef(c.oid) AS def
         FROM pg_constraint c
         JOIN pg_class t ON t.oid = c.conrelid
         JOIN pg_namespace n ON n.oid = t.relnamespace
         WHERE n.nspname = 'public'
           AND t.relname = 'operations'
           AND c.conname = 'operations_type_check'
         LIMIT 1`
    );

    const def = String(result.rows[0]?.def || '');
    if (!def || /correction/i.test(def)) {
        return;
    }

    await client.query('ALTER TABLE operations DROP CONSTRAINT operations_type_check');
    await client.query(
        `ALTER TABLE operations
         ADD CONSTRAINT operations_type_check
         CHECK (type IN ('receipt', 'shipment', 'inventory', 'writeoff', 'correction'))`
    );
}

function getItemQuantity(item) {
    const qty = Number(item?.quantity || 0);
    return Number.isFinite(qty) ? qty : 0;
}

function getShipmentAppliedQuantity(item) {
    const applied = Number(item?.appliedQuantity);
    if (Number.isFinite(applied) && applied >= 0) {
        return applied;
    }
    return getItemQuantity(item);
}

function getRollbackQuantityChange(operationType, item) {
    if (operationType === 'receipt') {
        return -getItemQuantity(item);
    }
    if (operationType === 'shipment') {
        return getShipmentAppliedQuantity(item);
    }
    if (operationType === 'writeoff') {
        return getItemQuantity(item);
    }
    if (operationType === 'correction') {
        const delta = Number(item?.delta);
        if (Number.isFinite(delta)) {
            return -delta;
        }
    }
    return 0;
}

function getApplyQuantityChange(operationType, item) {
    if (operationType === 'receipt') {
        return getItemQuantity(item);
    }
    if (operationType === 'shipment') {
        return -getShipmentAppliedQuantity(item);
    }
    if (operationType === 'writeoff') {
        return -getItemQuantity(item);
    }
    if (operationType === 'correction') {
        const delta = Number(item?.delta);
        if (Number.isFinite(delta)) {
            return delta;
        }
    }
    return 0;
}

// Get all operations
router.get('/', async (req, res) => {
    const { type, limit, offset, include_total, shipment_kind } = req.query;
    try {
        const whereParts = [];
        const whereParams = [];
        if (type) {
            whereParts.push(`type = $${whereParams.length + 1}`);
            whereParams.push(type);
        }

        const shipmentKind = String(shipment_kind || '').toLowerCase();
        if (type === 'shipment' && ['fbs', 'fbo', 'manual'].includes(shipmentKind)) {
            if (shipmentKind === 'fbs') {
                whereParts.push(`note ILIKE $${whereParams.length + 1}`);
                whereParams.push('OZON FBS%');
            } else if (shipmentKind === 'fbo') {
                whereParts.push(`note ILIKE $${whereParams.length + 1}`);
                whereParams.push('OZON FBO%');
            } else if (shipmentKind === 'manual') {
                whereParts.push(`(note IS NULL OR (note NOT ILIKE $${whereParams.length + 1} AND note NOT ILIKE $${whereParams.length + 2}))`);
                whereParams.push('OZON FBS%', 'OZON FBO%');
            }
        }
        const whereClause = whereParts.length ? ` WHERE ${whereParts.join(' AND ')}` : '';

        const parsedLimit = String(limit || '').toLowerCase() === 'all' ? null : parseInt(limit, 10);
        const parsedOffset = parseInt(offset, 10);
        const safeOffset = Number.isFinite(parsedOffset) && parsedOffset > 0 ? parsedOffset : 0;
        const usePagination = Number.isFinite(parsedLimit) && parsedLimit > 0;

        let query = `SELECT * FROM operations${whereClause} ORDER BY created_at DESC`;
        let params = [...whereParams];

        if (usePagination) {
            query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
            params.push(parsedLimit, safeOffset);
        }

        const result = await pool.query(query, params);

        const needTotal = String(include_total || '') === '1' || String(include_total || '').toLowerCase() === 'true';
        if (!needTotal) {
            res.json(result.rows);
            return;
        }

        const countResult = await pool.query(
            `SELECT COUNT(*)::int AS total FROM operations${whereClause}`,
            whereParams
        );
        const total = Number(countResult.rows[0]?.total || 0);

        res.json({
            items: result.rows,
            total,
            limit: usePagination ? parsedLimit : null,
            offset: usePagination ? safeOffset : 0
        });
    } catch (error) {
        console.error('Error fetching operations:', error);
        res.status(500).json({ error: 'Failed to fetch operations' });
    }
});

// Bulk delete operations (transactional)
router.post('/bulk-delete', async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map((id) => Number(id)).filter(Number.isFinite) : [];
    if (ids.length === 0) {
        return res.status(400).json({ error: 'ids array is required' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const operationsResult = await client.query(
            'SELECT * FROM operations WHERE id = ANY($1::int[]) ORDER BY id ASC FOR UPDATE',
            [ids]
        );

        if (operationsResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Operations not found' });
        }

        const operations = operationsResult.rows;

        // Rollback quantities for each operation
        for (const operation of operations) {
            if (operation.items && operation.items.length > 0) {
                for (const item of operation.items) {
                    const quantityChange = getRollbackQuantityChange(operation.type, item);
                    if (!quantityChange) continue;
                    await client.query(
                        'UPDATE products SET quantity = GREATEST(0, quantity + $1), updated_at = NOW() WHERE id = $2',
                        [quantityChange, item.productId]
                    );
                }
            }
        }

        const deletedIds = operations.map((op) => op.id);
        for (const shipmentId of deletedIds) {
            await client.query(
                `DELETE FROM operations
                 WHERE type = 'correction'
                   AND note LIKE $1`,
                [`Корректировка после отгрузки #${shipmentId}.%`]
            );
        }
        const hasFbs = operations.some((op) => String(op.note || '').startsWith('OZON FBS'));
        const hasFbo = operations.some((op) => String(op.note || '').startsWith('OZON FBO'));

        // Unlink FBS posting flags
        if (hasFbs) {
            await client.query(
                `ALTER TABLE IF EXISTS ozon_postings
                 ADD COLUMN IF NOT EXISTS shipment_applied BOOLEAN DEFAULT FALSE`
            );
            await client.query(
                `ALTER TABLE IF EXISTS ozon_postings
                 ADD COLUMN IF NOT EXISTS shipment_operation_id INTEGER`
            );
            await client.query(
                `UPDATE ozon_postings
                 SET shipment_applied = false,
                     shipment_operation_id = NULL,
                     updated_at = NOW()
                 WHERE shipment_operation_id = ANY($1::int[])`,
                [deletedIds]
            );
        }

        // Unlink FBO supply flags
        if (hasFbo && await tableExists(client, 'ozon_fbo_supplies')) {
            await client.query(
                `ALTER TABLE IF EXISTS ozon_fbo_supplies
                 ADD COLUMN IF NOT EXISTS shipment_applied BOOLEAN DEFAULT FALSE`
            );
            await client.query(
                `ALTER TABLE IF EXISTS ozon_fbo_supplies
                 ADD COLUMN IF NOT EXISTS shipment_operation_id INTEGER`
            );
            await client.query(
                `UPDATE ozon_fbo_supplies
                 SET shipment_applied = false,
                     shipment_operation_id = NULL,
                     updated_at = NOW()
                 WHERE shipment_operation_id = ANY($1::int[])`,
                [deletedIds]
            );
        }

        await client.query('DELETE FROM operations WHERE id = ANY($1::int[])', [deletedIds]);

        await client.query('COMMIT');
        res.json({
            success: true,
            deleted: deletedIds.length
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error bulk deleting operations:', error);
        res.status(500).json({ error: 'Failed to bulk delete operations' });
    } finally {
        client.release();
    }
});

// Get operation by ID
router.get('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('SELECT * FROM operations WHERE id = $1', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Operation not found' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching operation:', error);
        res.status(500).json({ error: 'Failed to fetch operation' });
    }
});

// Create operation (receipt/shipment/inventory/writeoff)
router.post('/', async (req, res) => {
    const { type, operation_date, note, items, total_quantity, differences, allow_shortage, shortage_adjustments } = req.body;

    if (!type || !['receipt', 'shipment', 'inventory', 'writeoff', 'correction'].includes(type)) {
        return res.status(400).json({ error: 'Invalid operation type' });
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        await ensureOperationsTypeConstraint(client);

        // Shipment with allowed shortage and correction document
        if (type === 'shipment' && items && items.length > 0) {
            const productIds = [...new Set(items.map((item) => Number(item.productId)).filter(Number.isFinite))];
            const adjustmentList = Array.isArray(shortage_adjustments) ? shortage_adjustments : [];
            const adjustmentMap = new Map(
                adjustmentList
                    .map((adj) => ({
                        productId: Number(adj?.productId),
                        actualRemaining: Number(adj?.actual_remaining),
                        reason: String(adj?.reason || '').trim()
                    }))
                    .filter((adj) => Number.isFinite(adj.productId))
                    .map((adj) => [adj.productId, adj])
            );

            const productsResult = await client.query(
                'SELECT id, name, sku, quantity FROM products WHERE id = ANY($1::int[]) FOR UPDATE',
                [productIds]
            );
            const productsMap = new Map(productsResult.rows.map((product) => [product.id, product]));

            const preparedItems = [];
            const correctionDiffs = [];

            for (const item of items) {
                const productId = Number(item?.productId);
                const requestQty = getItemQuantity(item);
                if (!Number.isFinite(productId) || requestQty <= 0) {
                    throw new Error('Invalid shipment item');
                }

                const product = productsMap.get(productId);
                if (!product) {
                    throw new Error(`Product not found: ${productId}`);
                }

                const availableBefore = Number(product.quantity || 0);
                let newQty;
                let appliedQty;

                if (requestQty <= availableBefore) {
                    newQty = availableBefore - requestQty;
                    appliedQty = requestQty;
                } else {
                    if (!allow_shortage) {
                        throw new Error(
                            `Недостаточно товара ${product.sku} (${product.name}). На складе: ${availableBefore}, требуется: ${requestQty}, не хватает: ${requestQty - availableBefore}`
                        );
                    }

                    const adjustment = adjustmentMap.get(productId);
                    if (!adjustment) {
                        throw new Error(`Для товара ${product.sku} не заполнена корректировка`);
                    }

                    if (!Number.isInteger(adjustment.actualRemaining) || adjustment.actualRemaining < 0) {
                        throw new Error(`Некорректный фактический остаток для ${product.sku}`);
                    }

                    if (adjustment.actualRemaining > availableBefore) {
                        throw new Error(`Фактический остаток для ${product.sku} не может быть больше текущего`);
                    }

                    if (!adjustment.reason) {
                        throw new Error(`Не указана причина корректировки для ${product.sku}`);
                    }

                    newQty = adjustment.actualRemaining;
                    appliedQty = availableBefore - newQty;
                    const expectedAfter = availableBefore - requestQty;
                    correctionDiffs.push({
                        productId: product.id,
                        productSKU: product.sku,
                        productName: product.name,
                        availableBefore,
                        requestedQty: requestQty,
                        expectedAfter,
                        actualAfter: newQty,
                        correctionDelta: newQty - expectedAfter,
                        reason: adjustment.reason
                    });
                }

                await client.query(
                    'UPDATE products SET quantity = $1, updated_at = NOW() WHERE id = $2',
                    [newQty, product.id]
                );

                preparedItems.push({
                    productId: product.id,
                    productName: item.productName || product.name,
                    productSKU: item.productSKU || product.sku,
                    quantity: requestQty,
                    appliedQuantity: appliedQty
                });
            }

            const shipmentTotalQty = preparedItems.reduce((sum, item) => sum + getItemQuantity(item), 0);
            const shipmentResult = await client.query(
                `INSERT INTO operations (type, operation_date, note, items, total_quantity, differences)
                 VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
                ['shipment', operation_date, note || '', JSON.stringify(preparedItems), shipmentTotalQty, JSON.stringify(differences || [])]
            );
            const shipmentOperation = shipmentResult.rows[0];

            let correctionOperation = null;
            if (correctionDiffs.length > 0) {
                const correctionTotal = correctionDiffs.reduce((sum, item) => sum + Math.abs(Number(item.correctionDelta || 0)), 0);
                const correctionNote = `Корректировка после отгрузки #${shipmentOperation.id}. ` +
                    correctionDiffs.map((item) => `${item.productSKU}: ${item.reason}`).join(' | ');
                const correctionResult = await client.query(
                    `INSERT INTO operations (type, operation_date, note, items, total_quantity, differences)
                     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
                    ['correction', operation_date, correctionNote, JSON.stringify([]), correctionTotal, JSON.stringify(correctionDiffs)]
                );
                correctionOperation = correctionResult.rows[0];
            }

            await client.query('COMMIT');
            res.status(201).json({
                ...shipmentOperation,
                correction_operation_id: correctionOperation?.id || null
            });
            return;
        }

        // Create operation
        const opResult = await client.query(
            `INSERT INTO operations (type, operation_date, note, items, total_quantity, differences)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [type, operation_date, note || '', JSON.stringify(items || []), total_quantity || 0, JSON.stringify(differences || [])]
        );

        const operation = opResult.rows[0];

        console.log(`Processing operation type: ${type}`);
        console.log(`Items count: ${items?.length || 0}`);
        console.log(`Differences count: ${differences?.length || 0}`);

        // Update product quantities for receipt/shipment/correction delta items
        if ((type === 'receipt' || type === 'shipment' || type === 'correction') && items && items.length > 0) {
            console.log(`Updating quantities for ${type}`);
            for (const item of items) {
                const quantityChange = getApplyQuantityChange(type, item);
                if (!quantityChange) continue;
                console.log(`Product ${item.productId}: changing by ${quantityChange}`);
                await client.query(
                    'UPDATE products SET quantity = GREATEST(0, quantity + $1), updated_at = NOW() WHERE id = $2',
                    [quantityChange, item.productId]
                );
            }
        }

        // For inventory - update ONLY products with differences (set absolute values)
        if (type === 'inventory' && differences && differences.length > 0) {
            console.log(`Processing inventory differences for ${differences.length} products`);
            for (const diff of differences) {
                const actualQuantity = parseInt(diff.actual);
                if (isNaN(actualQuantity)) {
                    throw new Error(`Invalid actual quantity for product ${diff.productId}: ${diff.actual}`);
                }

                console.log(`Product ${diff.productId}: setting to ${actualQuantity} (was ${diff.expected})`);

                await client.query(
                    'UPDATE products SET quantity = $1 WHERE id = $2',
                    [actualQuantity, diff.productId]
                );
            }
        } else if (type === 'inventory') {
            console.log('Inventory has no differences - no updates needed');
        }

        // For writeoff - decrease quantities and create writeoff records
        if (type === 'writeoff' && items && items.length > 0) {
            console.log(`Processing writeoff for ${items.length} items`);
            for (const item of items) {
                await client.query(
                    'UPDATE products SET quantity = quantity - $1 WHERE id = $2',
                    [item.quantity, item.productId]
                );

                await client.query(
                    `INSERT INTO writeoffs (product_id, operation_id, quantity, reason, note)
                     VALUES ($1, $2, $3, $4, $5)`,
                    [item.productId, operation.id, item.quantity, item.reason, item.note || '']
                );

                console.log(`Product ${item.productId}: writeoff ${item.quantity} (reason: ${item.reason})`);
            }
        }

        await client.query('COMMIT');
        res.status(201).json(operation);
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error creating operation:', error);
        res.status(500).json({ error: 'Failed to create operation' });
    } finally {
        client.release();
    }
});

// Update operation
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { operation_date, note, items, total_quantity, differences, allow_shortage, shortage_adjustments } = req.body;

    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        await ensureOperationsTypeConstraint(client);

        // Get old operation
        const oldOpResult = await client.query('SELECT * FROM operations WHERE id = $1', [id]);
        if (oldOpResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Operation not found' });
        }

        const oldOp = oldOpResult.rows[0];

        // Rollback old quantities
        if (oldOp.items && oldOp.items.length > 0) {
            for (const item of oldOp.items) {
                const quantityChange = getRollbackQuantityChange(oldOp.type, item);
                if (!quantityChange) continue;
                await client.query(
                    'UPDATE products SET quantity = GREATEST(0, quantity + $1) WHERE id = $2',
                    [quantityChange, item.productId]
                );
            }
        }

        if (oldOp.type === 'shipment') {
            const productIds = [...new Set((items || []).map((item) => Number(item.productId)).filter(Number.isFinite))];
            const adjustmentList = Array.isArray(shortage_adjustments) ? shortage_adjustments : [];
            const adjustmentMap = new Map(
                adjustmentList
                    .map((adj) => ({
                        productId: Number(adj?.productId),
                        actualRemaining: Number(adj?.actual_remaining),
                        reason: String(adj?.reason || '').trim()
                    }))
                    .filter((adj) => Number.isFinite(adj.productId))
                    .map((adj) => [adj.productId, adj])
            );

            const productsResult = await client.query(
                'SELECT id, name, sku, quantity FROM products WHERE id = ANY($1::int[]) FOR UPDATE',
                [productIds]
            );
            const productsMap = new Map(productsResult.rows.map((product) => [product.id, product]));

            const preparedItems = [];
            const correctionDiffs = [];

            for (const item of items || []) {
                const productId = Number(item?.productId);
                const requestQty = getItemQuantity(item);
                if (!Number.isFinite(productId) || requestQty <= 0) {
                    throw new Error('Invalid shipment item');
                }

                const product = productsMap.get(productId);
                if (!product) {
                    throw new Error(`Product not found: ${productId}`);
                }

                const availableBefore = Number(product.quantity || 0);
                let newQty;
                let appliedQty;

                if (requestQty <= availableBefore) {
                    newQty = availableBefore - requestQty;
                    appliedQty = requestQty;
                } else {
                    if (!allow_shortage) {
                        throw new Error(
                            `Недостаточно товара ${product.sku} (${product.name}). На складе: ${availableBefore}, требуется: ${requestQty}, не хватает: ${requestQty - availableBefore}`
                        );
                    }

                    const adjustment = adjustmentMap.get(productId);
                    if (!adjustment) {
                        throw new Error(`Для товара ${product.sku} не заполнена корректировка`);
                    }

                    if (!Number.isInteger(adjustment.actualRemaining) || adjustment.actualRemaining < 0) {
                        throw new Error(`Некорректный фактический остаток для ${product.sku}`);
                    }

                    if (adjustment.actualRemaining > availableBefore) {
                        throw new Error(`Фактический остаток для ${product.sku} не может быть больше текущего`);
                    }

                    if (!adjustment.reason) {
                        throw new Error(`Не указана причина корректировки для ${product.sku}`);
                    }

                    newQty = adjustment.actualRemaining;
                    appliedQty = availableBefore - newQty;
                    const expectedAfter = availableBefore - requestQty;
                    correctionDiffs.push({
                        productId: product.id,
                        productSKU: product.sku,
                        productName: product.name,
                        availableBefore,
                        requestedQty: requestQty,
                        expectedAfter,
                        actualAfter: newQty,
                        correctionDelta: newQty - expectedAfter,
                        reason: adjustment.reason
                    });
                }

                await client.query(
                    'UPDATE products SET quantity = $1, updated_at = NOW() WHERE id = $2',
                    [newQty, product.id]
                );

                preparedItems.push({
                    productId: product.id,
                    productName: item.productName || product.name,
                    productSKU: item.productSKU || product.sku,
                    quantity: requestQty,
                    appliedQuantity: appliedQty
                });
            }

            await client.query(
                `UPDATE operations
                 SET operation_date = $1, note = $2, items = $3, total_quantity = $4, differences = $5, updated_at = NOW()
                 WHERE id = $6`,
                [
                    operation_date,
                    note,
                    JSON.stringify(preparedItems || []),
                    total_quantity || preparedItems.reduce((sum, item) => sum + getItemQuantity(item), 0),
                    JSON.stringify([]),
                    id
                ]
            );

            await client.query(
                `DELETE FROM operations
                 WHERE type = 'correction'
                   AND note LIKE $1`,
                [`Корректировка после отгрузки #${id}.%`]
            );

            let correctionOperation = null;
            if (correctionDiffs.length > 0) {
                const correctionTotal = correctionDiffs.reduce((sum, item) => sum + Math.abs(Number(item.correctionDelta || 0)), 0);
                const correctionNote = `Корректировка после отгрузки #${id}. ` +
                    correctionDiffs.map((item) => `${item.productSKU}: ${item.reason}`).join(' | ');
                const correctionResult = await client.query(
                    `INSERT INTO operations (type, operation_date, note, items, total_quantity, differences)
                     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
                    ['correction', operation_date, correctionNote, JSON.stringify([]), correctionTotal, JSON.stringify(correctionDiffs)]
                );
                correctionOperation = correctionResult.rows[0];
            }

            const refreshed = await client.query('SELECT * FROM operations WHERE id = $1', [id]);
            await client.query('COMMIT');
            res.json({
                ...refreshed.rows[0],
                correction_operation_id: correctionOperation?.id || null
            });
            return;
        }

        // Update operation
        const result = await client.query(
            `UPDATE operations
             SET operation_date = $1, note = $2, items = $3, total_quantity = $4, differences = $5, updated_at = NOW()
             WHERE id = $6 RETURNING *`,
            [operation_date, note, JSON.stringify(items || []), total_quantity, JSON.stringify(differences || []), id]
        );

        const operation = result.rows[0];

        // Apply new quantities
        if (items && items.length > 0) {
            for (const item of items) {
                const quantityChange = getApplyQuantityChange(operation.type, item);
                if (!quantityChange) continue;
                await client.query(
                    'UPDATE products SET quantity = GREATEST(0, quantity + $1), updated_at = NOW() WHERE id = $2',
                    [quantityChange, item.productId]
                );
            }
        }

        await client.query('COMMIT');
        res.json(operation);
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error updating operation:', error);
        res.status(500).json({ error: 'Failed to update operation' });
    } finally {
        client.release();
    }
});

// Delete operation
router.delete('/:id', async (req, res) => {
    const { id } = req.params;

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Get operation
        const opResult = await client.query('SELECT * FROM operations WHERE id = $1', [id]);
        if (opResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Operation not found' });
        }

        const operation = opResult.rows[0];

        if (operation.ozon_posting_id) {
            await client.query(
                'UPDATE ozon_postings SET shipped = false WHERE id = $1',
                [operation.ozon_posting_id]
            );
        }

        // Rollback quantities
        if (operation.items && operation.items.length > 0) {
            for (const item of operation.items) {
                const quantityChange = getRollbackQuantityChange(operation.type, item);
                if (!quantityChange) continue;
                await client.query(
                    'UPDATE products SET quantity = GREATEST(0, quantity + $1), updated_at = NOW() WHERE id = $2',
                    [quantityChange, item.productId]
                );
            }
        }

        if (operation.note && operation.note.startsWith('OZON FBS')) {
            await client.query(
                `ALTER TABLE IF EXISTS ozon_postings
                 ADD COLUMN IF NOT EXISTS shipment_applied BOOLEAN DEFAULT FALSE`
            );
            await client.query(
                `ALTER TABLE IF EXISTS ozon_postings
                 ADD COLUMN IF NOT EXISTS shipment_operation_id INTEGER`
            );
            await client.query(
                `UPDATE ozon_postings
                 SET shipment_applied = false,
                     shipment_operation_id = NULL,
                     updated_at = NOW()
                 WHERE shipment_operation_id = $1`,
                [id]
            );
        }

        if (operation.type === 'shipment') {
            await client.query(
                `DELETE FROM operations
                 WHERE type = 'correction'
                   AND note LIKE $1`,
                [`Корректировка после отгрузки #${id}.%`]
            );
        }

        // Delete operation
        await client.query('DELETE FROM operations WHERE id = $1', [id]);

        await client.query('COMMIT');
        res.json({ message: 'Operation deleted' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error deleting operation:', error);
        res.status(500).json({ error: 'Failed to delete operation' });
    } finally {
        client.release();
    }
});

module.exports = router;
