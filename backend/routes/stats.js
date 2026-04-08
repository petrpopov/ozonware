const express = require('express');
const router = express.Router();
const pool = require('../db');

// Get all writeoffs with product details
router.get('/writeoffs', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                w.*,
                p.name as product_name,
                p.sku as product_sku,
                p.quantity as current_quantity
            FROM writeoffs w
                     JOIN products p ON w.product_id = p.id
            ORDER BY w.created_at DESC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching writeoffs:', error);
        res.status(500).json({ error: 'Failed to fetch writeoffs' });
    }
});

// Get writeoffs summary (aggregated by product and reason)
router.get('/writeoffs/summary', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                p.id as product_id,
                p.name as product_name,
                p.sku as product_sku,
                w.reason,
                SUM(w.quantity) as total_quantity,
                COUNT(*) as operations_count
            FROM writeoffs w
                     JOIN products p ON w.product_id = p.id
            GROUP BY p.id, p.name, p.sku, w.reason
            HAVING SUM(w.quantity) > 0
            ORDER BY p.sku, w.reason
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching writeoffs summary:', error);
        res.status(500).json({ error: 'Failed to fetch writeoffs summary' });
    }
});

// Get statistics
router.get('/stats', async (req, res) => {
    try {
        const productsCount = await pool.query('SELECT COUNT(*) as count FROM products');
        const totalQuantity = await pool.query('SELECT COALESCE(SUM(quantity), 0) as total FROM products');
        const receiptsCount = await pool.query("SELECT COUNT(*) as count FROM operations WHERE type = 'receipt'");
        const shipmentsCount = await pool.query("SELECT COUNT(*) as count FROM operations WHERE type = 'shipment'");

        res.json({
            totalProducts: parseInt(productsCount.rows[0].count),
            totalQuantity: parseInt(totalQuantity.rows[0].total),
            totalReceipts: parseInt(receiptsCount.rows[0].count),
            totalShipments: parseInt(shipmentsCount.rows[0].count)
        });
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ error: 'Failed to fetch statistics' });
    }
});

module.exports = router;
