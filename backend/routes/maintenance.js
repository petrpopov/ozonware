const express = require('express');
const router = express.Router();
const pool = require('../db');

async function tableExists(client, tableName) {
    const result = await client.query('SELECT to_regclass($1) AS reg', [`public.${tableName}`]);
    return Boolean(result.rows[0]?.reg);
}

router.post('/reset-state', async (req, res) => {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const stats = {
            operations: 0,
            writeoffs: 0,
            ozon_daily_shipments: 0,
            ozon_posting_items: 0,
            ozon_postings: 0,
            ozon_fbo_supply_items: 0,
            ozon_fbo_supplies: 0,
            products_reset: 0
        };

        if (await tableExists(client, 'operations')) {
            const result = await client.query('DELETE FROM operations');
            stats.operations = result.rowCount || 0;
        }

        if (await tableExists(client, 'writeoffs')) {
            const result = await client.query('DELETE FROM writeoffs');
            stats.writeoffs = result.rowCount || 0;
        }

        if (await tableExists(client, 'ozon_daily_shipments')) {
            const result = await client.query('DELETE FROM ozon_daily_shipments');
            stats.ozon_daily_shipments = result.rowCount || 0;
        }

        if (await tableExists(client, 'ozon_posting_items')) {
            const result = await client.query('DELETE FROM ozon_posting_items');
            stats.ozon_posting_items = result.rowCount || 0;
        }

        if (await tableExists(client, 'ozon_postings')) {
            const result = await client.query('DELETE FROM ozon_postings');
            stats.ozon_postings = result.rowCount || 0;
        }

        if (await tableExists(client, 'ozon_fbo_supply_items')) {
            const result = await client.query('DELETE FROM ozon_fbo_supply_items');
            stats.ozon_fbo_supply_items = result.rowCount || 0;
        }

        if (await tableExists(client, 'ozon_fbo_supplies')) {
            const result = await client.query('DELETE FROM ozon_fbo_supplies');
            stats.ozon_fbo_supplies = result.rowCount || 0;
        }

        if (await tableExists(client, 'products')) {
            const result = await client.query('UPDATE products SET quantity = 0, updated_at = NOW() WHERE quantity <> 0');
            stats.products_reset = result.rowCount || 0;
        }

        await client.query('COMMIT');
        res.json({
            success: true,
            message: 'Состояние успешно очищено',
            stats
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error resetting warehouse state:', error);
        res.status(500).json({ error: 'Failed to reset warehouse state' });
    } finally {
        client.release();
    }
});

module.exports = router;
