const express = require('express');
const router = express.Router();
const pool = require('../db');
const OzonService = require('../ozonService');
const ozonService = new OzonService(pool);

// Get OZON settings
router.get('/settings', async (req, res) => {
    try {
        const settings = await ozonService.getSettings();
        res.json(settings);
    } catch (error) {
        console.error('Error fetching OZON settings:', error);
        res.status(500).json({
            error: 'Failed to fetch OZON settings',
            message: error.message
        });
    }
});

// Save OZON settings
router.post('/settings', async (req, res) => {
    try {
        const settings = req.body;
        await ozonService.saveSettings(settings);
        res.json({ success: true });
    } catch (error) {
        console.error('Error saving OZON settings:', error);
        res.status(500).json({
            error: 'Failed to save OZON settings',
            message: error.message
        });
    }
});

// Sync with OZON (Server-Sent Events for progress)
router.get('/sync', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const sendProgress = (data) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
        const result = await ozonService.sync(sendProgress);

        sendProgress({
            status: 'complete',
            result: result
        });

        res.end();
    } catch (error) {
        if (error.canceled) {
            sendProgress({
                status: 'canceled',
                message: 'FBS синхронизация отменена пользователем'
            });
            res.end();
            return;
        }
        console.error('OZON sync error:', error);
        sendProgress({
            status: 'error',
            message: error.message
        });
        res.end();
    }
});

// Cancel running FBS sync
router.post('/fbs/cancel', async (req, res) => {
    try {
        const canceled = ozonService.requestFbsCancel();
        res.json({
            success: true,
            canceled
        });
    } catch (error) {
        console.error('OZON FBS cancel error:', error);
        res.status(500).json({
            error: 'Failed to cancel FBS sync',
            message: error.message
        });
    }
});

// Sync FBO supplies with OZON (Server-Sent Events for progress)
router.get('/fbo/sync', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const sendProgress = (data) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
        const result = await ozonService.syncFbo(sendProgress);

        sendProgress({
            status: 'complete',
            result
        });

        res.end();
    } catch (error) {
        if (error.canceled) {
            sendProgress({
                status: 'canceled',
                message: 'FBO синхронизация отменена пользователем'
            });
            res.end();
            return;
        }
        console.error('OZON FBO sync error:', error);
        sendProgress({
            status: 'error',
            message: error.message
        });
        res.end();
    }
});

// Cancel running FBO sync
router.post('/fbo/cancel', async (req, res) => {
    try {
        const canceled = ozonService.requestFboCancel();
        res.json({
            success: true,
            canceled
        });
    } catch (error) {
        console.error('OZON FBO cancel error:', error);
        res.status(500).json({
            error: 'Failed to cancel FBO sync',
            message: error.message
        });
    }
});

// Get daily shipment stats
router.get('/shipments', async (req, res) => {
    try {
        const stats = await ozonService.loadDailyStats();
        res.json(stats);
    } catch (error) {
        console.error('Error fetching daily stats:', error);
        res.status(500).json({
            error: 'Failed to fetch daily stats',
            message: error.message
        });
    }
});

// Sync products catalog attributes (images) from OZON
router.post('/products/sync', async (req, res) => {
    try {
        const result = await ozonService.syncProductImagesFromOzon();
        res.json(result);
    } catch (error) {
        console.error('Error syncing OZON products:', error);
        res.status(500).json({
            error: 'Failed to sync OZON products',
            message: error.message
        });
    }
});

// Get daily FBO supply stats
router.get('/fbo/supplies', async (req, res) => {
    try {
        const stats = await ozonService.loadFboDailyStats();
        res.json(stats);
    } catch (error) {
        console.error('Error fetching FBO daily stats:', error);
        res.status(500).json({
            error: 'Failed to fetch FBO daily stats',
            message: error.message
        });
    }
});

// Create shipments from FBO supplies
router.post('/fbo/shipments', async (req, res) => {
    try {
        const { days } = req.body || {};
        const result = await ozonService.createShipmentsFromFbo(days || null);
        res.json(result);
    } catch (error) {
        console.error('Error creating FBO shipments:', error);
        res.status(500).json({
            error: 'Failed to create FBO shipments',
            message: error.message
        });
    }
});

// Create shipments from daily OZON orders
router.post('/shipments', async (req, res) => {
    try {
        const { days } = req.body;
        const result = await ozonService.createShipments(days);
        res.json(result);
    } catch (error) {
        console.error('Error creating shipment:', error);
        res.status(500).json({
            error: 'Failed to create shipment',
            message: error.message
        });
    }
});

// Create shipments from parsed FBS CSV data
router.post('/fbs/shipments-from-csv', async (req, res) => {
    try {
        const { days } = req.body || {};
        const result = await ozonService.createShipmentsFromFbsCsv(days || []);
        res.json(result);
    } catch (error) {
        console.error('Error creating FBS shipments from CSV:', error);
        res.status(500).json({
            error: 'Failed to create FBS shipments from CSV',
            message: error.message
        });
    }
});

// Analyze parsed FBS CSV days against already applied shipment operations
router.post('/fbs/csv-analyze', async (req, res) => {
    try {
        const { days } = req.body || {};
        const result = await ozonService.analyzeFbsCsvDays(days || []);
        res.json(result);
    } catch (error) {
        console.error('Error analyzing FBS CSV:', error);
        res.status(500).json({
            error: 'Failed to analyze FBS CSV',
            message: error.message
        });
    }
});

module.exports = router;
