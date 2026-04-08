const express = require('express');
const router = express.Router();
const pool = require('../db');

async function getProductOperationsCount(productId) {
    const result = await pool.query(
        `SELECT COUNT(*)::int AS count
         FROM operations o
         WHERE EXISTS (
             SELECT 1
             FROM jsonb_array_elements(COALESCE(o.items, '[]'::jsonb)) AS item
             WHERE (item ? 'productId')
               AND (item->>'productId') ~ '^[0-9]+$'
               AND (item->>'productId')::int = $1
         )
         OR EXISTS (
             SELECT 1
             FROM jsonb_array_elements(COALESCE(o.differences, '[]'::jsonb)) AS diff
             WHERE (diff ? 'productId')
               AND (diff->>'productId') ~ '^[0-9]+$'
               AND (diff->>'productId')::int = $1
         )`,
        [productId]
    );
    return Number(result.rows[0]?.count || 0);
}

// Get all products
router.get('/', async (req, res) => {
    const { search } = req.query;
    try {
        let query = 'SELECT * FROM products';
        let params = [];

        if (search) {
            query += ` WHERE name ILIKE $1 OR sku ILIKE $1 OR custom_fields::text ILIKE $1`;
            params = [`%${search}%`];
        }

        query += ' ORDER BY id DESC';

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).json({ error: 'Failed to fetch products' });
    }
});

// Check product usage in operations
router.get('/:id/usage', async (req, res) => {
    const { id } = req.params;
    const productId = Number(id);
    if (!Number.isFinite(productId)) {
        return res.status(400).json({ error: 'Invalid product ID' });
    }
    try {
        const productResult = await pool.query('SELECT id FROM products WHERE id = $1', [productId]);
        if (productResult.rows.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }
        const operationsCount = await getProductOperationsCount(productId);
        res.json({
            product_id: productId,
            operations_count: operationsCount,
            can_delete: operationsCount === 0
        });
    } catch (error) {
        console.error('Error checking product usage:', error);
        res.status(500).json({ error: 'Failed to check product usage' });
    }
});

// Get product by ID
router.get('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('SELECT * FROM products WHERE id = $1', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching product:', error);
        res.status(500).json({ error: 'Failed to fetch product' });
    }
});

// Create product
router.post('/', async (req, res) => {
    const { name, sku, quantity, description, custom_fields } = req.body;

    if (!name || !sku) {
        return res.status(400).json({ error: 'Name and SKU are required' });
    }

    try {
        const result = await pool.query(
            `INSERT INTO products (name, sku, quantity, description, custom_fields)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [name, sku, quantity || 0, description || '', JSON.stringify(custom_fields || [])]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        if (error.code === '23505') { // Unique violation
            return res.status(409).json({ error: 'SKU already exists' });
        }
        console.error('Error creating product:', error);
        res.status(500).json({ error: 'Failed to create product' });
    }
});

// Update product
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { name, sku, quantity, description, custom_fields } = req.body;

    try {
        const result = await pool.query(
            `UPDATE products
             SET name = $1, sku = $2, quantity = $3, description = $4, custom_fields = $5
             WHERE id = $6 RETURNING *`,
            [name, sku, quantity, description, JSON.stringify(custom_fields || []), id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        if (error.code === '23505') {
            return res.status(409).json({ error: 'SKU already exists' });
        }
        console.error('Error updating product:', error);
        res.status(500).json({ error: 'Failed to update product' });
    }
});

// Delete product
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    const productId = Number(id);
    if (!Number.isFinite(productId)) {
        return res.status(400).json({ error: 'Invalid product ID' });
    }
    try {
        const operationsCount = await getProductOperationsCount(productId);
        if (operationsCount > 0) {
            return res.status(409).json({
                error: `Товар нельзя удалить: по нему есть операции (${operationsCount})`,
                operations_count: operationsCount
            });
        }
        const result = await pool.query('DELETE FROM products WHERE id = $1 RETURNING *', [productId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }
        res.json({ message: 'Product deleted' });
    } catch (error) {
        console.error('Error deleting product:', error);
        res.status(500).json({ error: 'Failed to delete product' });
    }
});

module.exports = router;
