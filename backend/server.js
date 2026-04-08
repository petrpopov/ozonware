const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/product-fields', require('./routes/productFields'));
app.use('/api/products', require('./routes/products'));
app.use('/api/operations', require('./routes/operations'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api', require('./routes/stats'));
app.use('/api', require('./routes/googleSheets'));
app.use('/api/ozon', require('./routes/ozon'));
app.use('/api/ozon/orders', require('./routes/ozonOrders'));
app.use('/api/maintenance', require('./routes/maintenance'));

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});
