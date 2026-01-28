const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Database connection
const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
});

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('❌ Database connection error:', err);
    } else {
        console.log('✅ Database connected:', res.rows[0].now);
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ==================== PRODUCT FIELDS API ====================

// Get all product fields
app.get('/api/product-fields', async (req, res) => {
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
app.post('/api/product-fields', async (req, res) => {
    const { name, type, required, show_in_table, options, position } = req.body;
    try {
        const result = await pool.query(
            `INSERT INTO product_fields (name, type, required, show_in_table, options, position)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [name, type, required || false, show_in_table !== false, JSON.stringify(options || []), position || 0]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error creating product field:', error);
        res.status(500).json({ error: 'Failed to create product field' });
    }
});

// Update product field
app.put('/api/product-fields/:id', async (req, res) => {
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
app.delete('/api/product-fields/:id', async (req, res) => {
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

// ==================== PRODUCTS API ====================

// Get all products
app.get('/api/products', async (req, res) => {
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

// Get product by ID
app.get('/api/products/:id', async (req, res) => {
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
app.post('/api/products', async (req, res) => {
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
app.put('/api/products/:id', async (req, res) => {
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
app.delete('/api/products/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('DELETE FROM products WHERE id = $1 RETURNING *', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }
        res.json({ message: 'Product deleted' });
    } catch (error) {
        console.error('Error deleting product:', error);
        res.status(500).json({ error: 'Failed to delete product' });
    }
});

// ==================== OPERATIONS API ====================

// Get all operations
app.get('/api/operations', async (req, res) => {
    const { type, limit } = req.query;
    try {
        let query = 'SELECT * FROM operations';
        let params = [];
        
        if (type) {
            query += ' WHERE type = $1';
            params.push(type);
        }
        
        query += ' ORDER BY created_at DESC';
        
        if (limit) {
            query += ` LIMIT $${params.length + 1}`;
            params.push(parseInt(limit));
        }
        
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching operations:', error);
        res.status(500).json({ error: 'Failed to fetch operations' });
    }
});

// Get operation by ID
app.get('/api/operations/:id', async (req, res) => {
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

// Create operation (receipt/shipment/inventory)
app.post('/api/operations', async (req, res) => {
    const { type, operation_date, note, items, total_quantity, differences } = req.body;
    
    if (!type || !['receipt', 'shipment', 'inventory', 'writeoff'].includes(type)) {
        return res.status(400).json({ error: 'Invalid operation type' });
    }
    
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
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
        
        // Update product quantities ONLY for receipt/shipment (NOT for inventory)
        if ((type === 'receipt' || type === 'shipment') && items && items.length > 0) {
            console.log(`Updating quantities for ${type}`);
            for (const item of items) {
                const quantityChange = type === 'receipt' ? item.quantity : -item.quantity;
                console.log(`Product ${item.productId}: changing by ${quantityChange}`);
                await client.query(
                    'UPDATE products SET quantity = quantity + $1 WHERE id = $2',
                    [quantityChange, item.productId]
                );
            }
        }
        
        // For inventory - update ONLY products with differences (set absolute values)
        if (type === 'inventory' && differences && differences.length > 0) {
            console.log(`Processing inventory differences for ${differences.length} products`);
            for (const diff of differences) {
                // Валидация: убеждаемся что actual это число
                const actualQuantity = parseInt(diff.actual);
                if (isNaN(actualQuantity)) {
                    throw new Error(`Invalid actual quantity for product ${diff.productId}: ${diff.actual}`);
                }
                
                console.log(`Product ${diff.productId}: setting to ${actualQuantity} (was ${diff.expected})`);
                
                // Устанавливаем фактическое количество
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
                // Decrease product quantity
                await client.query(
                    'UPDATE products SET quantity = quantity - $1 WHERE id = $2',
                    [item.quantity, item.productId]
                );
                
                // Create writeoff record
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
app.put('/api/operations/:id', async (req, res) => {
    const { id } = req.params;
    const { operation_date, note, items, total_quantity } = req.body;
    
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
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
                const quantityChange = oldOp.type === 'receipt' ? -item.quantity : item.quantity;
                await client.query(
                    'UPDATE products SET quantity = GREATEST(0, quantity + $1) WHERE id = $2',
                    [quantityChange, item.productId]
                );
            }
        }
        
        // Update operation
        const result = await client.query(
            `UPDATE operations 
             SET operation_date = $1, note = $2, items = $3, total_quantity = $4
             WHERE id = $5 RETURNING *`,
            [operation_date, note, JSON.stringify(items || []), total_quantity, id]
        );
        
        const operation = result.rows[0];
        
        // Apply new quantities
        if (items && items.length > 0) {
            for (const item of items) {
                const quantityChange = operation.type === 'receipt' ? item.quantity : -item.quantity;
                await client.query(
                    'UPDATE products SET quantity = quantity + $1 WHERE id = $2',
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
app.delete('/api/operations/:id', async (req, res) => {
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
        
        // Rollback quantities
        if (operation.items && operation.items.length > 0) {
            for (const item of operation.items) {
                const quantityChange = operation.type === 'receipt' ? -item.quantity : item.quantity;
                await client.query(
                    'UPDATE products SET quantity = GREATEST(0, quantity + $1) WHERE id = $2',
                    [quantityChange, item.productId]
                );
            }
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

// ==================== USER SETTINGS API ====================

// Get user settings
app.get('/api/settings/:key', async (req, res) => {
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
app.post('/api/settings/:key', async (req, res) => {
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

// ==================== STATS API ====================

// Get all writeoffs with product details
app.get('/api/writeoffs', async (req, res) => {
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
app.get('/api/writeoffs/summary', async (req, res) => {
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
app.get('/api/stats', async (req, res) => {
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

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});
