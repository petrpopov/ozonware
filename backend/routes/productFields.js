const express = require('express');
const router = express.Router();
const pool = require('../db');

// Get all product fields
router.get('/', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM product_fields ORDER BY position ASC, id ASC'
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching product fields:', error);
        res.status(500).json({ error: 'Failed to fetch product fields' });
    }
});

// Create product field
router.post('/', async (req, res) => {
    const { name, type, required, show_in_table, options, position } = req.body;
    try {
        const result = await pool.query(
            `INSERT INTO product_fields (name, type, required, show_in_table, options, position)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [name, type, !!required, !!show_in_table, JSON.stringify(options || []), position || 0]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error creating product field:', error);
        res.status(500).json({ error: 'Failed to create product field' });
    }
});

// Update product field
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { name, type, required, show_in_table, options, position } = req.body;
    try {
        const result = await pool.query(
            `UPDATE product_fields
             SET name = $1, type = $2, required = $3, show_in_table = $4, options = $5, position = $6
             WHERE id = $7 RETURNING *`,
            [name, type, required, show_in_table, JSON.stringify(options || []), position, id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Product field not found' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error updating product field:', error);
        res.status(500).json({ error: 'Failed to update product field' });
    }
});

// Delete product field
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('DELETE FROM product_fields WHERE id = $1 RETURNING *', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Product field not found' });
        }
        res.json({ message: 'Product field deleted' });
    } catch (error) {
        console.error('Error deleting product field:', error);
        res.status(500).json({ error: 'Failed to delete product field' });
    }
});

module.exports = router;
