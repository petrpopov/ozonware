const express = require('express');
const router = express.Router();
const pool = require('../db');

// Get user settings
router.get('/:key', async (req, res) => {
    const { key } = req.params;
    const userId = 1; // Default user

    try {
        const result = await pool.query(
            'SELECT setting_value FROM user_settings WHERE user_id = $1 AND setting_key = $2',
            [userId, key]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Setting not found' });
        }

        res.json(result.rows[0].setting_value);
    } catch (error) {
        console.error('Error fetching setting:', error);
        res.status(500).json({ error: 'Failed to fetch setting' });
    }
});

// Save user settings
router.post('/:key', async (req, res) => {
    const { key } = req.params;
    const { value } = req.body;
    const userId = 1; // Default user

    try {
        const result = await pool.query(
            `INSERT INTO user_settings (user_id, setting_key, setting_value)
             VALUES ($1, $2, $3)
             ON CONFLICT (user_id, setting_key)
                 DO UPDATE SET setting_value = $3
             RETURNING *`,
            [userId, key, JSON.stringify(value)]
        );

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error saving setting:', error);
        res.status(500).json({ error: 'Failed to save setting' });
    }
});

module.exports = router;
