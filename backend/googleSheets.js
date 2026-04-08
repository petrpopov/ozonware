const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

class GoogleSheetsService {
    constructor() {
        this.auth = null;
        this.sheets = null;
        this.initialized = false;
    }

    // Инициализация с Service Account
    async initialize() {
        try {
            // Путь к JSON ключу Service Account
            const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || path.join(__dirname, 'google-credentials.json');
            
            if (!fs.existsSync(keyPath)) {
                console.warn('⚠️ Google Service Account key not found:', keyPath);
                return false;
            }

            // Читаем ключ
            const credentials = JSON.parse(fs.readFileSync(keyPath, 'utf8'));

            // Создаем JWT auth
            this.auth = new google.auth.GoogleAuth({
                credentials,
                scopes: ['https://www.googleapis.com/auth/spreadsheets']
            });

            // Инициализируем Sheets API
            this.sheets = google.sheets({ version: 'v4', auth: this.auth });
            this.initialized = true;
            
            console.log('✅ Google Sheets API initialized');
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize Google Sheets API:', error.message);
            return false;
        }
    }

    // Проверка доступности таблицы
    async testConnection(spreadsheetId) {
        if (!this.initialized) {
            throw new Error('Google Sheets API not initialized');
        }

        try {
            const response = await this.sheets.spreadsheets.get({
                spreadsheetId,
                fields: 'properties.title,sheets.properties.title'
            });

            return {
                success: true,
                title: response.data.properties.title,
                sheets: response.data.sheets.map(s => s.properties.title)
            };
        } catch (error) {
            throw new Error(`Cannot access spreadsheet: ${error.message}`);
        }
    }

    // Чтение данных из таблицы
    async readRange(spreadsheetId, range) {
        if (!this.initialized) {
            throw new Error('Google Sheets API not initialized');
        }

        try {
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId,
                range
            });

            return response.data.values || [];
        } catch (error) {
            throw new Error(`Failed to read range: ${error.message}`);
        }
    }

    // Запись данных в таблицу
    async writeRange(spreadsheetId, range, values) {
        if (!this.initialized) {
            throw new Error('Google Sheets API not initialized');
        }

        try {
            const response = await this.sheets.spreadsheets.values.update({
                spreadsheetId,
                range,
                valueInputOption: 'RAW',
                resource: {
                    values: [values]
                }
            });

            return response.data;
        } catch (error) {
            throw new Error(`Failed to write range: ${error.message}`);
        }
    }

    // Батч-обновление (эффективнее для множества ячеек)
    async batchUpdate(spreadsheetId, updates) {
        if (!this.initialized) {
            throw new Error('Google Sheets API not initialized');
        }

        try {
            const response = await this.sheets.spreadsheets.values.batchUpdate({
                spreadsheetId,
                resource: {
                    valueInputOption: 'RAW',
                    data: updates
                }
            });

            return response.data;
        } catch (error) {
            throw new Error(`Failed to batch update: ${error.message}`);
        }
    }

    // Синхронизация остатков товаров
    async syncProducts(spreadsheetId, sheetName, skuColumn, quantityColumn, startRow, products) {
        if (!this.initialized) {
            throw new Error('Google Sheets API not initialized');
        }

        try {
            // Шаг 1: Читаем SKU из таблицы
            const skuRange = `${sheetName}!${skuColumn}${startRow}:${skuColumn}`;
            const skuData = await this.readRange(spreadsheetId, skuRange);

            // Создаем карту SKU -> номер строки
            const skuToRow = {};
            skuData.forEach((row, index) => {
                if (row[0]) {
                    const sku = row[0].toString().trim();
                    skuToRow[sku] = startRow + index;
                }
            });

            console.log(`📊 Found ${Object.keys(skuToRow).length} SKUs in spreadsheet`);

            // Шаг 2: Подготавливаем обновления
            const updates = [];
            let matched = 0;
            let notFound = 0;

            for (const product of products) {
                const sku = product.sku?.toString().trim();
                
                if (!sku) {
                    notFound++;
                    continue;
                }

                const rowNumber = skuToRow[sku];

                if (rowNumber) {
                    updates.push({
                        range: `${sheetName}!${quantityColumn}${rowNumber}`,
                        values: [[product.quantity]]
                    });
                    matched++;
                } else {
                    notFound++;
                }
            }

            if (updates.length === 0) {
                return {
                    success: true,
                    updated: 0,
                    matched: 0,
                    notFound: notFound
                };
            }

            console.log(`🔄 Updating ${updates.length} rows...`);

            // Шаг 3: Батч-обновление (по 1000 за раз - лимит API)
            const batchSize = 1000;
            let totalUpdated = 0;

            for (let i = 0; i < updates.length; i += batchSize) {
                const batch = updates.slice(i, i + batchSize);
                await this.batchUpdate(spreadsheetId, batch);
                totalUpdated += batch.length;

                console.log(`✅ Updated ${totalUpdated}/${updates.length}`);

                // Небольшая задержка между батчами (чтобы не превысить rate limit)
                if (i + batchSize < updates.length) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }

            return {
                success: true,
                updated: totalUpdated,
                matched: matched,
                notFound: notFound
            };

        } catch (error) {
            console.error('Sync error:', error);
            throw error;
        }
    }
}

// Singleton instance
const googleSheetsService = new GoogleSheetsService();

module.exports = googleSheetsService;
