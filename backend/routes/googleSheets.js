const express = require('express');
const router = express.Router();
const pool = require('../db');
const googleSheetsService = require('../googleSheets');

// Initialize Google Sheets on load
googleSheetsService.initialize().then(initialized => {
    if (initialized) {
        console.log('✅ Google Sheets service ready');
    } else {
        console.log('⚠️ Google Sheets service not available (credentials not found)');
    }
});

// Get sync config
router.get('/google-sheets-config', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM user_settings WHERE setting_key = $1',
            ['google_sheets_config']
        );

        if (result.rows.length > 0) {
            res.json(result.rows[0].setting_value);
        } else {
            res.json({
                spreadsheetId: '',
                sheetName: 'Лист1',
                skuColumn: 'A',
                quantityColumn: 'B',
                startRow: 2
            });
        }
    } catch (error) {
        console.error('Error fetching Google Sheets config:', error);
        res.status(500).json({ error: 'Failed to fetch config' });
    }
});

// Save sync config
router.post('/google-sheets-config', async (req, res) => {
    try {
        const config = req.body;

        const result = await pool.query(
            `INSERT INTO user_settings (setting_key, setting_value)
             VALUES ($1, $2)
             ON CONFLICT (user_id, setting_key)
                 DO UPDATE SET setting_value = $2, updated_at = CURRENT_TIMESTAMP
             RETURNING *`,
            ['google_sheets_config', JSON.stringify(config)]
        );

        res.json(result.rows[0].setting_value);
    } catch (error) {
        console.error('Error saving Google Sheets config:', error);
        res.status(500).json({ error: 'Failed to save config' });
    }
});

// Test connection
router.post('/google-sheets-test', async (req, res) => {
    try {
        if (!googleSheetsService.initialized) {
            return res.status(503).json({
                success: false,
                error: 'Google Sheets service not initialized. Check credentials file.'
            });
        }

        const { spreadsheetId } = req.body;

        if (!spreadsheetId) {
            return res.status(400).json({
                success: false,
                error: 'Spreadsheet ID is required'
            });
        }

        const result = await googleSheetsService.testConnection(spreadsheetId);
        res.json(result);

    } catch (error) {
        console.error('Google Sheets test failed:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Sync with Google Sheets
router.post('/google-sheets-sync', async (req, res) => {
    try {
        if (!googleSheetsService.initialized) {
            return res.status(503).json({
                success: false,
                error: 'Google Sheets service not initialized. Check credentials file.'
            });
        }

        const { spreadsheetId, sheetName, skuColumn, quantityColumn, startRow } = req.body;

        if (!spreadsheetId) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameter: spreadsheetId'
            });
        }

        const productsResult = await pool.query('SELECT id, sku, quantity FROM products');
        const products = productsResult.rows;

        console.log(`🔄 Starting sync: ${products.length} products`);

        const result = await googleSheetsService.syncProducts(
            spreadsheetId,
            sheetName || 'Лист1',
            skuColumn || 'A',
            quantityColumn || 'B',
            startRow || 2,
            products
        );

        console.log(`✅ Sync completed: ${result.updated} rows updated`);
        res.json(result);

    } catch (error) {
        console.error('Google Sheets sync error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
