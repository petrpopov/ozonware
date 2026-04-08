// ozonService.js - Сервис для работы с OZON FBS API

const fetch = require('node-fetch');

class OzonService {
    constructor(pool) {
        this.pool = pool;
        this.apiUrl = 'https://api-seller.ozon.ru/v3/posting/fbs/list';
        this.fboListUrl = 'https://api-seller.ozon.ru/v3/supply-order/list';
        this.fboGetUrl = 'https://api-seller.ozon.ru/v3/supply-order/get';
        this.fboBundleUrl = 'https://api-seller.ozon.ru/v1/supply-order/bundle';
        this.productListUrl = 'https://api-seller.ozon.ru/v3/product/list';
        this.productAttributesUrl = 'https://api-seller.ozon.ru/v4/product/info/attributes';
        this.minRequestIntervalMs = Number(process.env.OZON_REQUEST_PAUSE_MS || 1500);
        this.lastRequestAt = 0;
        this.fbsSyncRunning = false;
        this.fbsCancelRequested = false;
        this.fbsAbortController = null;
        this.fboSyncRunning = false;
        this.fboCancelRequested = false;
        this.fboAbortController = null;
    }

    async sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    /**
     * Получить настройки OZON из БД
     */
    async getSettings() {
        const result = await this.pool.query(
            "SELECT setting_value FROM user_settings WHERE setting_key = 'ozon_settings'"
        );
        
        if (result.rows.length === 0) {
            throw new Error('OZON settings not configured');
        }
        
        return result.rows[0].setting_value;
    }

    /**
     * Сохранить настройки OZON в БД
     */
    async saveSettings(settings) {
        await this.pool.query(
            `INSERT INTO user_settings (setting_key, setting_value, created_at, updated_at)
             VALUES ('ozon_settings', $1, NOW(), NOW())
             ON CONFLICT (setting_key)
                 DO UPDATE SET
                               setting_value = EXCLUDED.setting_value,
                               updated_at = NOW()`,
            [JSON.stringify(settings)]
        );
    }

    /**
     * Конвертировать московское время в UTC
     */
    moscowToUTC(moscowDateString) {
        const moscowDate = new Date(moscowDateString);
        // Москва UTC+3
        const utcDate = new Date(moscowDate.getTime() - 3 * 60 * 60 * 1000);
        return utcDate.toISOString();
    }

    /**
     * Конвертировать UTC в московское время
     */
    utcToMoscow(utcDateString) {
        const utcDate = new Date(utcDateString);
        // Добавляем 3 часа для Москвы
        const moscowDate = new Date(utcDate.getTime() + 3 * 60 * 60 * 1000);
        return moscowDate;
    }

    /**
     * Получить день доставки (дата без времени) по московскому времени
     */
    getDeliveryDay(utcDateString) {
        const moscowDate = this.utcToMoscow(utcDateString);
        // Возвращаем дату в формате YYYY-MM-DD
        return moscowDate.toISOString().split('T')[0];
    }

    getMoscowYmdParts(date) {
        const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Europe/Moscow',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).formatToParts(date);

        const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
        return {
            year: Number(map.year),
            month: Number(map.month),
            day: Number(map.day)
        };
    }

    /**
     * Запрос к OZON API
     */
    makeCanceledError(message = 'Sync canceled by user') {
        const error = new Error(message);
        error.canceled = true;
        return error;
    }

    beginFbsSyncSession() {
        if (this.fbsSyncRunning) {
            throw new Error('FBS sync is already running');
        }
        this.fbsSyncRunning = true;
        this.fbsCancelRequested = false;
        this.fbsAbortController = new AbortController();
    }

    endFbsSyncSession() {
        this.fbsSyncRunning = false;
        this.fbsCancelRequested = false;
        this.fbsAbortController = null;
    }

    requestFbsCancel() {
        if (!this.fbsSyncRunning) {
            return false;
        }
        this.fbsCancelRequested = true;
        if (this.fbsAbortController) {
            this.fbsAbortController.abort();
        }
        return true;
    }

    ensureFbsNotCanceled() {
        if (this.fbsCancelRequested) {
            throw this.makeCanceledError('FBS sync canceled by user');
        }
    }

    beginFboSyncSession() {
        if (this.fboSyncRunning) {
            throw new Error('FBO sync is already running');
        }
        this.fboSyncRunning = true;
        this.fboCancelRequested = false;
        this.fboAbortController = new AbortController();
    }

    endFboSyncSession() {
        this.fboSyncRunning = false;
        this.fboCancelRequested = false;
        this.fboAbortController = null;
    }

    requestFboCancel() {
        if (!this.fboSyncRunning) {
            return false;
        }
        this.fboCancelRequested = true;
        if (this.fboAbortController) {
            this.fboAbortController.abort();
        }
        return true;
    }

    ensureFboNotCanceled() {
        if (this.fboCancelRequested) {
            throw this.makeCanceledError('FBO sync canceled by user');
        }
    }

    async makeRequestByUrl(url, clientId, apiKey, requestBody, options = {}) {
        const now = Date.now();
        const elapsed = now - this.lastRequestAt;
        if (elapsed < this.minRequestIntervalMs) {
            await this.sleep(this.minRequestIntervalMs - elapsed);
        }

        let response;
        try {
            response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': '*/*',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Connection': 'keep-alive',
                    'Client-Id': clientId,
                    'Api-Key': apiKey
                },
                body: JSON.stringify(requestBody),
                signal: options.signal
            });
            this.lastRequestAt = Date.now();
        } catch (error) {
            if (error.name === 'AbortError') {
                throw this.makeCanceledError();
            }
            throw error;
        }

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`OZON API error: ${response.status} - ${error}`);
        }

        return await response.json();
    }

    async makeRequest(clientId, apiKey, requestBody, options = {}) {
        return this.makeRequestByUrl(this.apiUrl, clientId, apiKey, requestBody, options);
    }

    /**
     * Загрузить все отправления с пагинацией
     */
    async fetchAllPostings(settings, onProgress) {
        const { clientId, apiKey, syncStartDate } = settings;

        if (!clientId || !apiKey) {
            throw new Error('OZON Client ID and API Key are required');
        }

        // Период считаем строго по календарному дню Москвы и переводим в UTC.
        const syncBaseDate = syncStartDate ? new Date(syncStartDate) : new Date();
        const syncDate = Number.isNaN(syncBaseDate.getTime()) ? new Date() : syncBaseDate;
        const sinceParts = this.getMoscowYmdParts(syncDate);
        const sinceUTC = new Date(Date.UTC(
            sinceParts.year,
            sinceParts.month - 1,
            sinceParts.day,
            21, 0, 0, 0
        )).toISOString();

        const now = new Date();
        const toParts = this.getMoscowYmdParts(now);
        const toUTCString = new Date(Date.UTC(
            toParts.year,
            toParts.month - 1,
            toParts.day,
            20, 59, 59, 999
        )).toISOString();

        let allPostings = [];
        let offset = 0;
        const limit = 1000;
        let hasNext = true;
        let pageNum = 0;

        onProgress?.({
            status: 'loading',
            message: `Начало загрузки с ${sinceParts.year}-${String(sinceParts.month).padStart(2, '0')}-${String(sinceParts.day).padStart(2, '0')} до конца текущего дня (МСК)...`
        });

        while (hasNext) {
            this.ensureFbsNotCanceled();
            pageNum++;

            const requestBody = {
                dir: 'DESC',
                filter: {
                    since: sinceUTC,
                    to: toUTCString
                },
                limit: limit,
                offset: offset,
                with: {
                    analytics_data: true,
                    barcodes: false,
                    financial_data: false,
                    translit: false
                }
            };

            onProgress?.({
                status: 'loading',
                message: `Загрузка страницы ${pageNum} (offset: ${offset})...`
            });

            const data = await this.makeRequest(clientId, apiKey, requestBody, {
                signal: this.fbsAbortController?.signal
            });

            const postings = data.result?.postings || [];

            onProgress?.({
                status: 'loading',
                message: `Получено ${postings.length} заказов (всего: ${allPostings.length + postings.length})`
            });

            allPostings = allPostings.concat(postings);

            hasNext = data.result?.has_next || false;

            if (postings.length === 0) {
                hasNext = false;
            }

            offset += postings.length;

            if (postings.length < limit) {
                hasNext = false;
            }

            if (hasNext) {
                await new Promise(resolve => setTimeout(resolve, 300));
            }
        }

        onProgress?.({
            status: 'processing',
            message: `Загружено ${allPostings.length} заказов. Обработка...`
        });

        return allPostings;
    }

    /**
     * Фильтровать и дедуплицировать отправления
     */
    filterAndDeduplicate(postings) {
        const validStatuses = ['awaiting_deliver', 'delivering', 'delivered', 'canceled', 'cancelled'];

        // Для отмененных заказов учитываем только те, что были отменены ПОСЛЕ отгрузки.
        // Отмененные до отгрузки (delivering_date=null, cancelled_after_ship=false) НЕ должны списывать остаток.
        const filtered = postings.filter((p) => {
            const status = String(p.status || '').toLowerCase();
            if (!validStatuses.includes(status)) {
                return false;
            }

            if (status === 'canceled' || status === 'cancelled') {
                const cancelledAfterShip = Boolean(p?.cancellation?.cancelled_after_ship);
                const hasDeliveringDate = Boolean(p.delivering_date);
                return cancelledAfterShip || hasDeliveringDate;
            }

            return true;
        });
        
        // Удаляем дубликаты по posting_number
        const unique = {};
        filtered.forEach(posting => {
            unique[posting.posting_number] = posting;
        });
        
        return Object.values(unique);
    }

    /**
     * Найти товар в БД по OZON SKU
     */
    async findProductByOzonSku(ozonSku, offer_id) {
        // Проверяем, начинается ли SKU с "OZN"
        const skuString = String(ozonSku);
        const searchValue = skuString.startsWith('OZN') ? skuString : `OZN${skuString}`;

        // Ищем в кастомных полях товара
        // custom_fields это массив объектов, нужно найти объект где name='OZON' и value=searchValue
        const result = await this.pool.query(
            `SELECT p.* FROM products p
             WHERE EXISTS (
                 SELECT 1 FROM jsonb_array_elements(p.custom_fields) AS elem
                 WHERE elem->>'name' = 'OZON' AND elem->>'value' = $1
             )
             LIMIT 1`,
            [searchValue]
        );

        const resultedItem = result.rows[0]
        if(resultedItem) {
            return resultedItem
        }

        if (offer_id === undefined || offer_id === null) {
            return null;
        }

        const offerId = String(offer_id).trim();
        if (!offerId) {
            return null;
        }

        // Fallback для уценки: суффикс _dm или _dm### на конце артикула OZON.
        // Примеры: xxx_dm, xxx_dm0, xxx_dm11, XXX_DM3
        if (/(_dm\d*)$/i.test(offerId)) {
            const art = offerId.replace(/(_dm\d*)$/i, '');

            const result = await this.pool.query(
                `SELECT p.* FROM products p
                 WHERE EXISTS (
                     SELECT 1 FROM jsonb_array_elements(p.custom_fields) AS elem
                     WHERE elem->>'name' = 'Артикул OZON' AND elem->>'value' = $1
                 )
                 LIMIT 1`,
                    [art]
                );

            const resultedItem = result.rows[0]
            if(resultedItem) {
                return resultedItem
            }
        }

        return null;
    }

    async ensureOzonPhotoField() {
        const existing = await this.pool.query(
            `SELECT id FROM product_fields WHERE name = 'Фото OZON' LIMIT 1`
        );
        if (existing.rows.length > 0) {
            return existing.rows[0].id;
        }

        const created = await this.pool.query(
            `INSERT INTO product_fields (name, type, required, show_in_table, options, position)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id`,
            ['Фото OZON', 'text', false, false, JSON.stringify([]), 999]
        );
        return created.rows[0].id;
    }

    async findProductByOzonOfferId(offerId) {
        const result = await this.pool.query(
            `SELECT p.* FROM products p
             WHERE EXISTS (
                 SELECT 1 FROM jsonb_array_elements(p.custom_fields) AS elem
                 WHERE elem->>'name' = 'Артикул OZON' AND elem->>'value' = $1
             )
             LIMIT 1`,
            [offerId]
        );
        return result.rows[0] || null;
    }

    buildCustomFieldsWithPhoto(customFields, photoUrl) {
        const normalized = Array.isArray(customFields) ? [...customFields] : [];
        const idx = normalized.findIndex((field) => String(field?.name || '') === 'Фото OZON');
        const nextField = {
            name: 'Фото OZON',
            type: 'text',
            value: photoUrl,
            required: false
        };
        if (idx >= 0) {
            normalized[idx] = { ...normalized[idx], ...nextField };
            return normalized;
        }
        normalized.push(nextField);
        return normalized;
    }

    chunkArray(values, size) {
        const chunks = [];
        for (let i = 0; i < values.length; i += size) {
            chunks.push(values.slice(i, i + size));
        }
        return chunks;
    }

    async syncProductImagesFromOzon() {
        const settings = await this.getSettings();
        const { clientId, apiKey } = settings || {};
        if (!clientId || !apiKey) {
            throw new Error('OZON Client ID and API Key are required');
        }

        await this.ensureOzonPhotoField();

        const offerIds = [];
        let lastId = '';
        let page = 0;

        do {
            page += 1;
            const payload = {
                filter: {
                    offer_id: [],
                    product_id: [],
                    visibility: 'ALL'
                },
                last_id: lastId || '',
                limit: 1000
            };
            const data = await this.makeRequestByUrl(this.productListUrl, clientId, apiKey, payload);
            const items = data?.result?.items || [];
            items.forEach((item) => {
                const offerId = String(item?.offer_id || '').trim();
                if (offerId) {
                    offerIds.push(offerId);
                }
            });
            lastId = String(data?.result?.last_id || '').trim();
            if (page > 1000) break;
        } while (lastId);

        const uniqueOfferIds = [...new Set(offerIds)];
        if (uniqueOfferIds.length === 0) {
            return {
                summary: {
                    offers: 0,
                    details: 0,
                    matched: 0,
                    updated: 0,
                    notFound: 0,
                    noImage: 0
                }
            };
        }

        let detailsCount = 0;
        let matched = 0;
        let updated = 0;
        let notFound = 0;
        let noImage = 0;

        const chunks = this.chunkArray(uniqueOfferIds, 1000);
        for (const chunk of chunks) {
            const payload = {
                filter: {
                    offer_id: chunk,
                    visibility: 'ALL'
                },
                limit: 1000,
                sort_dir: 'ASC'
            };
            const data = await this.makeRequestByUrl(this.productAttributesUrl, clientId, apiKey, payload);
            const details = data?.result || [];
            detailsCount += details.length;

            for (const detail of details) {
                const offerId = String(detail?.offer_id || '').trim();
                if (!offerId) continue;

                const product = await this.findProductByOzonOfferId(offerId);
                if (!product) {
                    notFound += 1;
                    continue;
                }
                matched += 1;

                const imageUrl = String(detail?.primary_image || '').trim();
                if (!imageUrl) {
                    noImage += 1;
                    continue;
                }

                const nextCustomFields = this.buildCustomFieldsWithPhoto(product.custom_fields, imageUrl);
                const prevPhoto = (Array.isArray(product.custom_fields) ? product.custom_fields : [])
                    .find((field) => String(field?.name || '') === 'Фото OZON')?.value;

                if (String(prevPhoto || '') === imageUrl) {
                    continue;
                }

                await this.pool.query(
                    `UPDATE products SET custom_fields = $1, updated_at = NOW() WHERE id = $2`,
                    [JSON.stringify(nextCustomFields), product.id]
                );
                updated += 1;
            }
        }

        return {
            summary: {
                offers: uniqueOfferIds.length,
                details: detailsCount,
                matched,
                updated,
                notFound,
                noImage
            }
        };
    }

    /**
     * Сохранить или обновить отправление в БД
     */
    async upsertPosting(posting) {
        const {
            posting_number,
            order_number,
            status,
            in_process_at
        } = posting;

        const result = await this.pool.query(
            `INSERT INTO ozon_postings (
                       posting_number, 
                       order_number, 
                       status,
                       in_process_at, 
                       raw_data,
                       created_at,
                       updated_at
        )
        VALUES ($1, $2, $3, $4::timestamp, $5, NOW(), NOW())
        ON CONFLICT (posting_number) 
        DO UPDATE SET 
            status = $3,
            raw_data = $5,
            updated_at = NOW()
        RETURNING id`,
            [
                posting_number,
                order_number,
                status,
                in_process_at, // НЕ new Date()! Просто строка "2026-02-07T20:49:33Z"
                JSON.stringify(posting)
            ]
        );

        return result.rows[0].id;
    }

    /**
     * Сохранить товары отправления
     */
    async savePostingItems(postingId, products) {
        // Сначала удаляем старые записи
        await this.pool.query(
            'DELETE FROM ozon_posting_items WHERE posting_id = $1',
            [postingId]
        );

        // Добавляем новые
        for (const product of products) {
            const { sku, quantity, name, offer_id } = product;
            
            // Ищем товар в нашей БД
            const dbProduct = await this.findProductByOzonSku(sku, offer_id);
            
            await this.pool.query(
                `INSERT INTO ozon_posting_items (
                    posting_id, ozon_sku, product_id, quantity, product_name, offer_id, created_at, updated_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
                [
                    postingId,
                    sku,
                    dbProduct?.id || null,
                    quantity,
                    name,
                    offer_id
                ]
            );
        }
    }

    /**
     * Синхронизация с OZON
     */
    async sync(onProgress) {
        try {
            this.beginFbsSyncSession();
            // 1. Получаем настройки
            const settings = await this.getSettings();

            // 2. Загружаем все отправления
            const allPostings = await this.fetchAllPostings(settings, onProgress);

            // 3. Фильтруем и дедуплицируем
            const validPostings = this.filterAndDeduplicate(allPostings);

            onProgress?.({
                status: 'saving',
                message: `Сохранение ${validPostings.length} отправлений в БД...`
            });

            // 4. Сохраняем в БД
            let savedCount = 0;
            for (const posting of validPostings) {
                const postingId = await this.upsertPosting(posting);
                await this.savePostingItems(postingId, posting.products || []);
                savedCount++;

                if (savedCount % 10 === 0) {
                    onProgress?.({
                        status: 'saving',
                        message: `Сохранено ${savedCount} из ${validPostings.length}...`
                    });
                }
            }

            onProgress?.({
                status: 'complete',
                message: `Синхронизация завершена! ${validPostings.length} заказов`,
            });

            return {
                totalPostings: validPostings.length,
                message: 'ok'
            };
        } catch (error) {
            if (error.canceled) {
                onProgress?.({
                    status: 'canceled',
                    message: 'FBS синхронизация отменена пользователем'
                });
                throw error;
            }
            onProgress?.({
                status: 'error',
                message: `Ошибка: ${error.message}`
            });
            throw error;
        } finally {
            this.endFbsSyncSession();
        }
    }

    async loadDailyStats() {
        const ordersData = await this.pool.query(
            `select op.id, op.posting_number, op.status, (op.in_process_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Moscow')::date as day, op.raw_data
             from public.ozon_postings op
             order by op.in_process_at desc`
        );

        const groupedByDay = [];
        const dayMap = new Map();

        ordersData.rows.forEach(row => {
            const day = row.day.toLocaleDateString('en-CA');

            if (!dayMap.has(day)) {
                const dayGroup = {
                    id: row.id,
                    day,
                    orders: [],
                    orderCount: 0,
                    items: [],
                    itemsCount: 0,
                    skuCount: 0
                };
                dayMap.set(day, dayGroup);
                groupedByDay.push(dayGroup);
            }

            const dayGroup = dayMap.get(day);
            const order = {
                posting_number: row.posting_number,
                status: row.status,
                items: [],
                itemCount: 0
            };

            if (row.raw_data?.products) {
                row.raw_data.products.forEach(product => {
                    const sku = `OZN${product.sku}`;

                    order.items.push({
                        sku: sku,
                        quantity: product.quantity,
                        name: product.name,
                        offer_id: product.offer_id,
                    });
                    order.itemCount += product.quantity;

                    // Добавляем/обновляем в items дня
                    let dayItem = dayGroup.items.find(item => item.sku === sku);
                    if (!dayItem) {
                        dayItem = {
                            sku: sku,
                            name: product.name,
                            offer_id: product.offer_id,
                            quantity: 0,
                            orders: []
                        };
                        dayGroup.items.push(dayItem);
                    }
                    dayItem.quantity += product.quantity;
                    if (!dayItem.orders.includes(row.posting_number)) {
                        dayItem.orders.push(row.posting_number);
                    }
                });
            }

            dayGroup.orders.push(order);
            dayGroup.orderCount++;
        });

        // Подсчитываем итоговые значения для каждого дня
        groupedByDay.forEach(dayGroup => {
            dayGroup.itemsCount = dayGroup.items.reduce((sum, item) => sum + item.quantity, 0);
            dayGroup.skuCount = dayGroup.items.length;
        });

        return groupedByDay;
    }

    async createShipments(selectedDays = null) {
        await this.ensureOzonPostingColumns();
        const groupedByDay = await this.loadDailyStats();

        // Фильтруем по выбранным дням, если они переданы
        const daysToProcess = selectedDays
            ? groupedByDay.filter(day => selectedDays.includes(day.day))
            : groupedByDay;

        const results = [];

        for (const day of daysToProcess) {
            const client = await this.pool.connect();

            try {
                await client.query('BEGIN');

                const existingOpResult = await client.query(
                    `SELECT * FROM operations
                     WHERE type = 'shipment'
                       AND operation_date = $1::date
                       AND note LIKE 'OZON FBS от %'
                     ORDER BY id DESC
                     LIMIT 1`,
                    [day.day]
                );
                const existingOperation = existingOpResult.rows[0] || null;

                // Откатываем старую версию отгрузки дня, если она уже была.
                if (existingOperation?.items?.length) {
                    for (const oldItem of existingOperation.items) {
                        if (!oldItem.productId) continue;
                        await client.query(
                            'UPDATE products SET quantity = quantity + $1, updated_at = NOW() WHERE id = $2',
                            [Number(oldItem.quantity || 0), oldItem.productId]
                        );
                    }

                    await client.query(
                        `UPDATE ozon_postings
                         SET shipped = false,
                             shipment_applied = false,
                             shipment_operation_id = NULL,
                             updated_at = NOW()
                         WHERE shipment_operation_id = $1`,
                        [existingOperation.id]
                    );
                }

                const items = [];
                let total_quantity = 0;
                const errors = [];
                const mismatches = []; // Для детальной информации о расхождениях

                for(const item of day.items) {
                    const dbItem = await this.findProductByOzonSku(item.sku, item.offer_id);

                    if (!dbItem) {
                        const errorDetail = {
                            sku: item.sku,
                            name: item.name || 'Неизвестно',
                            reason: 'Товар не найден в базе данных'
                        };
                        console.warn(`❌ [${day.day}] Товар не найден: ${item.sku}`);
                        errors.push(`Товар не найден: ${item.sku}`);
                        mismatches.push(errorDetail);
                        continue;
                    }

                    // Проверяем достаточно ли товара на складе
                    if (dbItem.quantity < item.quantity) {
                        const errorDetail = {
                            sku: dbItem.sku,
                            name: dbItem.name,
                            inStock: dbItem.quantity,
                            required: item.quantity,
                            shortage: item.quantity - dbItem.quantity,
                            reason: 'Недостаточно товара на складе'
                        };

                        const errorMsg = `Недостаточно товара ${dbItem.sku} (${dbItem.name}). На складе: ${dbItem.quantity}, требуется: ${item.quantity}, не хватает: ${item.quantity - dbItem.quantity}`;
                        console.error(`❌ [${day.day}] ${errorMsg}`);
                        errors.push(errorMsg);
                        mismatches.push(errorDetail);
                        continue;
                    }

                    items.push({
                        quantity: Number(item.quantity || 0),
                        productId: dbItem.id,
                        productSKU: dbItem.sku,
                        productName: dbItem.name,
                    });

                    total_quantity += Number(item.quantity || 0);

                    // Уменьшаем количество товара в таблице products
                    await client.query(
                        `UPDATE products SET quantity = quantity - $1, updated_at = NOW() WHERE id = $2`,
                        [Number(item.quantity || 0), dbItem.id]
                    );
                }

                // Если были ошибки, откатываем транзакцию
                if (errors.length > 0) {
                    await client.query('ROLLBACK');

                    console.error(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
                    console.error(`❌ ОТГРУЗКА НЕ УДАЛАСЬ: ${day.day}`);
                    console.error(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
                    console.error(`Всего ошибок: ${errors.length}`);
                    console.error(`\nДетали расхождений:`);
                    mismatches.forEach((mismatch, index) => {
                        console.error(`\n${index + 1}. ${mismatch.reason}`);
                        console.error(`   SKU: ${mismatch.sku}`);
                        console.error(`   Название: ${mismatch.name}`);
                        if (mismatch.inStock !== undefined) {
                            console.error(`   На складе: ${mismatch.inStock}`);
                            console.error(`   Требуется: ${mismatch.required}`);
                            console.error(`   Не хватает: ${mismatch.shortage}`);
                        }
                    });
                    console.error(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

                    results.push({
                        day: day.day,
                        status: 'error',
                        errorCount: errors.length,
                        errors: errors,
                        mismatches: mismatches
                    });
                    continue;
                }

                // Если нет товаров для отгрузки
                if (items.length === 0) {
                    await client.query('ROLLBACK');
                    console.warn(`⚠️ [${day.day}] Нет товаров для отгрузки`);
                    results.push({
                        day: day.day,
                        status: 'error',
                        error: 'Нет товаров для отгрузки'
                    });
                    continue;
                }

                const note = `OZON FBS от ${day.day}`;
                let operation;
                if (existingOperation) {
                    const updateResult = await client.query(
                        `UPDATE operations
                         SET note = $1,
                             items = $2,
                             total_quantity = $3,
                             differences = $4,
                             updated_at = NOW()
                         WHERE id = $5
                         RETURNING *`,
                        [note, JSON.stringify(items || []), total_quantity, JSON.stringify([]), existingOperation.id]
                    );
                    operation = updateResult.rows[0];
                } else {
                    const insertResult = await client.query(
                        `INSERT INTO operations (type, operation_date, note, items, total_quantity, differences)
                         VALUES ($1, $2, $3, $4, $5, $6)
                         RETURNING *`,
                        ['shipment', day.day, note, JSON.stringify(items || []), total_quantity, JSON.stringify([])]
                    );
                    operation = insertResult.rows[0];
                }

                // Привязываем все FBS posting этого дня (по Москве) к операции.
                await client.query(
                    `UPDATE ozon_postings
                     SET shipped = true,
                         shipment_applied = true,
                         shipment_operation_id = $2,
                         updated_at = NOW()
                     WHERE (in_process_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Moscow')::date = $1::date`,
                    [day.day, operation.id]
                );

                await client.query('COMMIT');
                console.log(`✅ [${day.day}] Отгрузка FBS ${existingOperation ? 'обновлена' : 'создана'}, операция ID: ${operation.id}, товаров: ${items.length}, всего штук: ${total_quantity}`);
                results.push({
                    day: day.day,
                    status: existingOperation ? 'replaced' : 'success',
                    operationId: operation.id,
                    itemsCount: items.length,
                    totalQuantity: total_quantity
                });

            } catch (error) {
                console.error(`❌ [${day.day}] Ошибка создания отгрузки:`, error);
                await client.query('ROLLBACK');
                results.push({ day: day.day, status: 'error', error: error.message });
            } finally {
                client.release();
            }
        }

        // Итоговая статистика
        const successCount = results.filter(r => r.status === 'success' || r.status === 'replaced').length;
        const errorCount = results.filter(r => r.status === 'error').length;
        const alreadyProcessedCount = results.filter(r => r.status === 'already_processed').length;

        console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`📊 ИТОГО:`);
        console.log(`   ✅ Успешно: ${successCount}`);
        console.log(`   ❌ Ошибки: ${errorCount}`);
        console.log(`   ⏭️ Уже обработано: ${alreadyProcessedCount}`);
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

        return {
            summary: {
                total: results.length,
                success: successCount,
                errors: errorCount,
                alreadyProcessed: alreadyProcessedCount
            },
            details: results
        };
    }

    async createShipmentsFromFbsCsv(daysData = []) {
        if (!Array.isArray(daysData) || daysData.length === 0) {
            return {
                summary: { total: 0, success: 0, errors: 0, alreadyProcessed: 0 },
                details: []
            };
        }

        await this.ensureOzonPostingColumns();
        const results = [];

        for (const dayData of daysData) {
            const day = String(dayData?.day || '').slice(0, 10);
            const sourceItems = Array.isArray(dayData?.items) ? dayData.items : [];
                if (!day || sourceItems.length === 0) {
                console.error(`[FBS CSV] Некорректные данные дня: day=${day || '—'}, items=${sourceItems.length}`);
                results.push({ day: day || '—', status: 'error', error: 'Некорректные данные дня для CSV' });
                continue;
            }

            const client = await this.pool.connect();
            try {
                await client.query('BEGIN');

                const existingOpResult = await client.query(
                    `SELECT * FROM operations
                     WHERE type = 'shipment'
                       AND operation_date = $1::date
                       AND note LIKE 'OZON FBS от %'
                     ORDER BY id DESC
                     LIMIT 1`,
                    [day]
                );
                const existingOperation = existingOpResult.rows[0] || null;

                if (existingOperation?.items?.length) {
                    for (const oldItem of existingOperation.items) {
                        if (!oldItem.productId) continue;
                        await client.query(
                            'UPDATE products SET quantity = quantity + $1, updated_at = NOW() WHERE id = $2',
                            [Number(oldItem.quantity || 0), oldItem.productId]
                        );
                    }

                    await client.query(
                        `UPDATE ozon_postings
                         SET shipped = false,
                             shipment_applied = false,
                             shipment_operation_id = NULL,
                             updated_at = NOW()
                         WHERE shipment_operation_id = $1`,
                        [existingOperation.id]
                    );
                }

                const items = [];
                let total_quantity = 0;
                const errors = [];
                const mismatches = [];

                for (const item of sourceItems) {
                    const dbItem = await this.findProductByOzonSku(item.sku, item.offer_id);
                    const requiredQty = Number(item.quantity || 0);

                    if (!dbItem) {
                        const errorDetail = {
                            sku: item.sku,
                            name: item.name || 'Неизвестно',
                            reason: 'Товар не найден в базе данных'
                        };
                        errors.push(`Товар не найден: OZN${item.sku}`);
                        mismatches.push(errorDetail);
                        continue;
                    }

                    if (Number(dbItem.quantity || 0) < requiredQty) {
                        const errorDetail = {
                            sku: dbItem.sku,
                            name: dbItem.name,
                            inStock: Number(dbItem.quantity || 0),
                            required: requiredQty,
                            shortage: requiredQty - Number(dbItem.quantity || 0),
                            reason: 'Недостаточно товара на складе'
                        };
                        errors.push(
                            `Недостаточно товара ${dbItem.sku} (${dbItem.name}). На складе: ${dbItem.quantity}, требуется: ${requiredQty}, не хватает: ${requiredQty - Number(dbItem.quantity || 0)}`
                        );
                        mismatches.push(errorDetail);
                        continue;
                    }

                    items.push({
                        quantity: requiredQty,
                        productId: dbItem.id,
                        productSKU: dbItem.sku,
                        productName: dbItem.name
                    });
                    total_quantity += requiredQty;

                    await client.query(
                        'UPDATE products SET quantity = quantity - $1, updated_at = NOW() WHERE id = $2',
                        [requiredQty, dbItem.id]
                    );
                }

                if (errors.length > 0) {
                    await client.query('ROLLBACK');
                    console.error(
                        `[FBS CSV] День ${day}: ошибки проведения (${errors.length})\n${errors.map((e, i) => `${i + 1}. ${e}`).join('\n')}`
                    );
                    results.push({
                        day,
                        status: 'error',
                        errorCount: errors.length,
                        errors,
                        mismatches
                    });
                    continue;
                }

                if (items.length === 0) {
                    await client.query('ROLLBACK');
                    console.error(`[FBS CSV] День ${day}: нет товаров для отгрузки после матчинга`);
                    results.push({ day, status: 'error', error: 'Нет товаров для отгрузки' });
                    continue;
                }

                const note = `OZON FBS от ${day}`;
                let operation;
                if (existingOperation) {
                    const updateResult = await client.query(
                        `UPDATE operations
                         SET note = $1,
                             items = $2,
                             total_quantity = $3,
                             differences = $4,
                             updated_at = NOW()
                         WHERE id = $5
                         RETURNING *`,
                        [note, JSON.stringify(items || []), total_quantity, JSON.stringify([]), existingOperation.id]
                    );
                    operation = updateResult.rows[0];
                } else {
                    const insertResult = await client.query(
                        `INSERT INTO operations (type, operation_date, note, items, total_quantity, differences)
                         VALUES ($1, $2, $3, $4, $5, $6)
                         RETURNING *`,
                        ['shipment', day, note, JSON.stringify(items || []), total_quantity, JSON.stringify([])]
                    );
                    operation = insertResult.rows[0];
                }

                await client.query('COMMIT');
                results.push({
                    day,
                    status: existingOperation ? 'replaced' : 'success',
                    operationId: operation.id,
                    itemsCount: items.length,
                    totalQuantity: total_quantity
                });
            } catch (error) {
                await client.query('ROLLBACK');
                console.error(`[FBS CSV] День ${day}: exception`, error);
                results.push({ day, status: 'error', error: error.message });
            } finally {
                client.release();
            }
        }

        const successCount = results.filter((r) => r.status === 'success' || r.status === 'replaced').length;
        const errorCount = results.filter((r) => r.status === 'error').length;
        const alreadyProcessedCount = results.filter((r) => r.status === 'already_processed').length;

        return {
            summary: {
                total: results.length,
                success: successCount,
                errors: errorCount,
                alreadyProcessed: alreadyProcessedCount
            },
            details: results
        };
    }

    async analyzeFbsCsvDays(daysData = []) {
        if (!Array.isArray(daysData) || daysData.length === 0) {
            return {
                summary: { total: 0, unchanged: 0, new: 0, updated: 0, withIssues: 0 },
                details: []
            };
        }

        const lookupCache = new Map();
        const resolveProduct = async (sku, offerId) => {
            const key = `${String(sku || '').trim()}|${String(offerId || '').trim().toLowerCase()}`;
            if (lookupCache.has(key)) return lookupCache.get(key);
            const found = await this.findProductByOzonSku(sku, offerId);
            lookupCache.set(key, found || null);
            return found || null;
        };

        const details = [];
        for (const dayData of daysData) {
            const day = String(dayData?.day || '').slice(0, 10);
            const sourceItems = Array.isArray(dayData?.items) ? dayData.items : [];
            if (!day || sourceItems.length === 0) {
                details.push({
                    day: day || '—',
                    status: 'error',
                    statusLabel: 'Ошибка',
                    changed: false,
                    note: 'Некорректные данные дня'
                });
                continue;
            }

            const existingOpResult = await this.pool.query(
                `SELECT id, total_quantity, items
                 FROM operations
                 WHERE type = 'shipment'
                   AND operation_date = $1::date
                   AND note LIKE 'OZON FBS от %'
                 ORDER BY id DESC
                 LIMIT 1`,
                [day]
            );
            const existingOperation = existingOpResult.rows[0] || null;

            const incomingMap = new Map();
            let incomingTotal = 0;
            let incomingMatchedTotal = 0;
            const unmatchedItems = [];

            for (const item of sourceItems) {
                const qty = Number(item?.quantity || 0);
                if (!Number.isFinite(qty) || qty <= 0) continue;
                incomingTotal += qty;
                const dbItem = await resolveProduct(item?.sku, item?.offer_id);
                if (!dbItem?.id) {
                    unmatchedItems.push({
                        sku: item?.sku || '',
                        offer_id: item?.offer_id || '',
                        name: item?.name || '',
                        quantity: qty
                    });
                    continue;
                }
                incomingMatchedTotal += qty;
                const productId = Number(dbItem.id);
                incomingMap.set(productId, Number(incomingMap.get(productId) || 0) + qty);
            }

            const existingMap = new Map();
            let existingTotal = 0;
            if (existingOperation?.items?.length) {
                for (const row of existingOperation.items) {
                    const productId = Number(row?.productId || 0);
                    const qty = Number(row?.quantity || 0);
                    if (!productId || !Number.isFinite(qty) || qty <= 0) continue;
                    existingTotal += qty;
                    existingMap.set(productId, Number(existingMap.get(productId) || 0) + qty);
                }
            }

            const mapEquals = () => {
                if (incomingMap.size !== existingMap.size) return false;
                for (const [productId, qty] of incomingMap.entries()) {
                    if (Number(existingMap.get(productId) || 0) !== Number(qty || 0)) return false;
                }
                return true;
            };

            let status = 'new';
            let statusLabel = 'Новый день';
            let changed = true;

            if (existingOperation) {
                if (mapEquals() && unmatchedItems.length === 0) {
                    status = 'unchanged';
                    statusLabel = 'Без изменений';
                    changed = false;
                } else {
                    status = 'updated';
                    statusLabel = 'Будет обновлен';
                }
            }

            if (unmatchedItems.length > 0) {
                status = status === 'new' ? 'new_with_issues' : 'updated_with_issues';
                statusLabel = `${statusLabel} (есть несопоставленные)`;
            }

            details.push({
                day,
                status,
                statusLabel,
                changed,
                hasExisting: Boolean(existingOperation),
                existingOperationId: existingOperation?.id || null,
                existingTotal,
                incomingTotal,
                incomingMatchedTotal,
                unmatchedCount: unmatchedItems.length,
                unmatchedItems
            });
        }

        const summary = details.reduce(
            (acc, item) => {
                acc.total += 1;
                if (item.status === 'unchanged') acc.unchanged += 1;
                if (item.status.startsWith('new')) acc.new += 1;
                if (item.status.startsWith('updated')) acc.updated += 1;
                if (item.status.includes('issues') || item.status === 'error') acc.withIssues += 1;
                return acc;
            },
            { total: 0, unchanged: 0, new: 0, updated: 0, withIssues: 0 }
        );

        return { summary, details };
    }

    async ensureOzonPostingColumns() {
        await this.pool.query(`
            ALTER TABLE IF EXISTS ozon_postings
            ADD COLUMN IF NOT EXISTS shipment_applied BOOLEAN DEFAULT FALSE;
        `);

        await this.pool.query(`
            ALTER TABLE IF EXISTS ozon_postings
            ADD COLUMN IF NOT EXISTS shipment_operation_id INTEGER;
        `);
    }

    async ensureFboTables() {
        await this.pool.query(`
            CREATE TABLE IF NOT EXISTS ozon_fbo_supplies (
                id SERIAL PRIMARY KEY,
                order_id BIGINT NOT NULL,
                order_number TEXT,
                state TEXT,
                order_created_date TIMESTAMPTZ,
                state_updated_date TIMESTAMPTZ,
                supply_id BIGINT,
                bundle_id TEXT NOT NULL UNIQUE,
                arrival_date TIMESTAMPTZ,
                warehouse_id BIGINT,
                warehouse_name TEXT,
                warehouse_address TEXT,
                raw_order JSONB,
                raw_supply JSONB,
                shipment_applied BOOLEAN DEFAULT FALSE,
                shipment_operation_id INTEGER,
                created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
            );
        `);

        await this.pool.query(`
            CREATE TABLE IF NOT EXISTS ozon_fbo_supply_items (
                id SERIAL PRIMARY KEY,
                supply_id INTEGER NOT NULL REFERENCES ozon_fbo_supplies(id) ON DELETE CASCADE,
                ozon_sku TEXT NOT NULL,
                product_id INTEGER REFERENCES products(id),
                quantity INTEGER NOT NULL DEFAULT 0,
                product_name TEXT,
                offer_id TEXT,
                icon_path TEXT,
                raw_item JSONB,
                created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
            );
        `);

        await this.pool.query(`
            CREATE INDEX IF NOT EXISTS idx_ozon_fbo_supplies_arrival_date
            ON ozon_fbo_supplies (arrival_date);
        `);

        await this.pool.query(`
            CREATE INDEX IF NOT EXISTS idx_ozon_fbo_supply_items_supply_id
            ON ozon_fbo_supply_items (supply_id);
        `);

        await this.pool.query(`
            ALTER TABLE ozon_fbo_supplies
            ADD COLUMN IF NOT EXISTS shipment_applied BOOLEAN DEFAULT FALSE;
        `);

        await this.pool.query(`
            ALTER TABLE ozon_fbo_supplies
            ADD COLUMN IF NOT EXISTS shipment_operation_id INTEGER;
        `);
    }

    async fetchFboOrderIds(settings, onProgress) {
        const { clientId, apiKey } = settings;
        let lastId = '';
        let page = 0;
        const uniqueIds = new Set();

        while (true) {
            this.ensureFboNotCanceled();
            page += 1;
            const body = {
                filter: { states: ['COMPLETED', 'ACCEPTED_AT_SUPPLY_WAREHOUSE'] },
                limit: 100,
                sort_by: 'ORDER_CREATION',
                sort_dir: 'DESC'
            };
            if (lastId) {
                body.last_id = lastId;
            }

            const data = await this.makeRequestByUrl(this.fboListUrl, clientId, apiKey, body, {
                signal: this.fboAbortController?.signal
            });
            const payload = data?.result || data || {};
            const ids = payload.order_ids || [];
            ids.forEach((id) => uniqueIds.add(Number(id)));
            lastId = payload.last_id || '';

            onProgress?.({
                status: 'loading',
                message: `FBO list: страница ${page}, получено ${ids.length}, всего ${uniqueIds.size}`
            });

            if (!lastId) {
                break;
            }
        }

        return Array.from(uniqueIds).filter((id) => Number.isFinite(id));
    }

    chunkArray(items, size) {
        const chunks = [];
        for (let i = 0; i < items.length; i += size) {
            chunks.push(items.slice(i, i + size));
        }
        return chunks;
    }

    async fetchFboOrders(settings, orderIds, onProgress) {
        const { clientId, apiKey } = settings;
        const chunks = this.chunkArray(orderIds, 50);
        const orders = [];

        for (let index = 0; index < chunks.length; index += 1) {
            this.ensureFboNotCanceled();
            const chunk = chunks[index];
            const data = await this.makeRequestByUrl(this.fboGetUrl, clientId, apiKey, {
                order_ids: chunk
            }, {
                signal: this.fboAbortController?.signal
            });
            const payload = data?.result || data || {};
            const part = payload.orders || [];
            orders.push(...part);

            onProgress?.({
                status: 'loading',
                message: `FBO get: ${index + 1}/${chunks.length}, поставок ${orders.length}`
            });
        }

        return orders;
    }

    extractFboSupplies(orders) {
        const supplies = [];
        for (const order of orders || []) {
            for (const supply of order.supplies || []) {
                if (!supply.bundle_id) continue;
                supplies.push({
                    order_id: Number(order.order_id),
                    order_number: order.order_number || null,
                    state: order.state || supply.state || null,
                    order_created_date: order.created_date || null,
                    state_updated_date: order.state_updated_date || null,
                    supply_id: Number(supply.supply_id || 0) || null,
                    bundle_id: String(supply.bundle_id),
                    arrival_date: supply.storage_warehouse?.arrival_date || null,
                    warehouse_id: Number(supply.storage_warehouse?.warehouse_id || 0) || null,
                    warehouse_name: supply.storage_warehouse?.name || null,
                    warehouse_address: supply.storage_warehouse?.address || null,
                    raw_order: order,
                    raw_supply: supply
                });
            }
        }
        return supplies;
    }

    async fetchFboBundleItems(settings, bundleId, onProgress) {
        const { clientId, apiKey } = settings;
        let lastId = '';
        let hasNext = true;
        const items = [];
        let page = 0;

        while (hasNext) {
            this.ensureFboNotCanceled();
            page += 1;
            const body = {
                bundle_ids: [bundleId],
                is_asc: true,
                limit: 100
            };
            if (lastId) {
                body.last_id = lastId;
            }

            const data = await this.makeRequestByUrl(this.fboBundleUrl, clientId, apiKey, body, {
                signal: this.fboAbortController?.signal
            });
            const payload = data?.result || data || {};
            const part = payload.items || [];
            items.push(...part);
            hasNext = Boolean(payload.has_next);
            lastId = payload.last_id || '';

            onProgress?.({
                status: 'loading',
                message: `FBO bundle ${bundleId.slice(0, 8)}…: стр. ${page}, товаров ${items.length}`
            });
        }

        return items;
    }

    async upsertFboSupply(supply) {
        const result = await this.pool.query(
            `INSERT INTO ozon_fbo_supplies (
                order_id, order_number, state, order_created_date, state_updated_date, supply_id,
                bundle_id, arrival_date, warehouse_id, warehouse_name, warehouse_address, raw_order, raw_supply, created_at, updated_at
            )
            VALUES ($1, $2, $3, $4::timestamptz, $5::timestamptz, $6, $7, $8::timestamptz, $9, $10, $11, $12, $13, NOW(), NOW())
            ON CONFLICT (bundle_id) DO UPDATE SET
                order_id = EXCLUDED.order_id,
                order_number = EXCLUDED.order_number,
                state = EXCLUDED.state,
                order_created_date = EXCLUDED.order_created_date,
                state_updated_date = EXCLUDED.state_updated_date,
                supply_id = EXCLUDED.supply_id,
                arrival_date = EXCLUDED.arrival_date,
                warehouse_id = EXCLUDED.warehouse_id,
                warehouse_name = EXCLUDED.warehouse_name,
                warehouse_address = EXCLUDED.warehouse_address,
                raw_order = EXCLUDED.raw_order,
                raw_supply = EXCLUDED.raw_supply,
                updated_at = NOW()
            RETURNING id`,
            [
                supply.order_id,
                supply.order_number,
                supply.state,
                supply.order_created_date,
                supply.state_updated_date,
                supply.supply_id,
                supply.bundle_id,
                supply.arrival_date,
                supply.warehouse_id,
                supply.warehouse_name,
                supply.warehouse_address,
                JSON.stringify(supply.raw_order || {}),
                JSON.stringify(supply.raw_supply || {})
            ]
        );

        return result.rows[0].id;
    }

    async saveFboSupplyItems(supplyDbId, items) {
        await this.pool.query('DELETE FROM ozon_fbo_supply_items WHERE supply_id = $1', [supplyDbId]);

        for (const item of items || []) {
            const dbProduct = await this.findProductByOzonSku(item.sku, item.offer_id);
            await this.pool.query(
                `INSERT INTO ozon_fbo_supply_items (
                    supply_id, ozon_sku, product_id, quantity, product_name, offer_id, icon_path, raw_item, created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
                [
                    supplyDbId,
                    String(item.sku),
                    dbProduct?.id || null,
                    Number(item.quantity || 0),
                    item.name || null,
                    item.offer_id || null,
                    item.icon_path || null,
                    JSON.stringify(item || {})
                ]
            );
        }
    }

    async syncFbo(onProgress) {
        try {
            this.beginFboSyncSession();
            await this.ensureFboTables();
            const settings = await this.getSettings();
            const { clientId, apiKey } = settings;

            if (!clientId || !apiKey) {
                throw new Error('OZON Client ID and API Key are required');
            }

            const orderIds = await this.fetchFboOrderIds(settings, onProgress);
            onProgress?.({
                status: 'loading',
                message: `FBO: найдено поставок ${orderIds.length}`
            });

            if (orderIds.length === 0) {
                onProgress?.({ status: 'complete', message: 'FBO: поставки не найдены' });
                return { supplies: 0, bundles: 0, items: 0 };
            }

            const orders = await this.fetchFboOrders(settings, orderIds, onProgress);
            const supplies = this.extractFboSupplies(orders);

            onProgress?.({
                status: 'saving',
                message: `FBO: найдено bundle ${supplies.length}, сохранение...`
            });

            let saved = 0;
            let totalItems = 0;

            for (const supply of supplies) {
                this.ensureFboNotCanceled();
                const bundleItems = await this.fetchFboBundleItems(settings, supply.bundle_id, onProgress);
                const supplyDbId = await this.upsertFboSupply(supply);
                await this.saveFboSupplyItems(supplyDbId, bundleItems);

                saved += 1;
                totalItems += bundleItems.length;

                if (saved % 10 === 0) {
                    onProgress?.({
                        status: 'saving',
                        message: `FBO: сохранено ${saved}/${supplies.length}`
                    });
                }
            }

            onProgress?.({
                status: 'complete',
                message: `FBO синхронизация завершена: поставок ${saved}, позиций ${totalItems}`
            });

            return {
                supplies: saved,
                bundles: supplies.length,
                items: totalItems
            };
        } catch (error) {
            if (error.canceled) {
                onProgress?.({
                    status: 'canceled',
                    message: 'FBO синхронизация отменена пользователем'
                });
                throw error;
            }
            onProgress?.({
                status: 'error',
                message: `Ошибка FBO: ${error.message}`
            });
            throw error;
        } finally {
            this.endFboSyncSession();
        }
    }

    async loadFboDailyStats() {
        await this.ensureFboTables();

        const supplyResult = await this.pool.query(
            `SELECT
                s.id,
                s.order_id,
                s.order_number,
                s.state,
                s.bundle_id,
                s.supply_id,
                s.arrival_date,
                s.order_created_date,
                s.warehouse_name,
                s.warehouse_address,
                s.shipment_applied,
                s.shipment_operation_id,
                to_char(timezone('Europe/Moscow', COALESCE(s.arrival_date, s.order_created_date)), 'YYYY-MM-DD') AS day
             FROM ozon_fbo_supplies s
             ORDER BY COALESCE(s.arrival_date, s.order_created_date) DESC, s.id DESC`
        );

        if (supplyResult.rows.length === 0) {
            return [];
        }

        const itemResult = await this.pool.query(
            `SELECT
                i.supply_id,
                i.ozon_sku,
                i.product_id,
                i.quantity,
                i.product_name,
                i.offer_id,
                i.icon_path
             FROM ozon_fbo_supply_items i
             ORDER BY i.id ASC`
        );

        const itemsBySupply = new Map();
        for (const item of itemResult.rows) {
            if (!itemsBySupply.has(item.supply_id)) {
                itemsBySupply.set(item.supply_id, []);
            }
            itemsBySupply.get(item.supply_id).push({
                sku: item.ozon_sku,
                product_id: item.product_id,
                quantity: Number(item.quantity || 0),
                name: item.product_name,
                offer_id: item.offer_id,
                icon_path: item.icon_path
            });
        }

        const dayMap = new Map();
        const grouped = [];

        for (const row of supplyResult.rows) {
            const day = String(row.day || '');
            if (!dayMap.has(day)) {
                const dayGroup = {
                    day,
                    supplyCount: 0,
                    skuCount: 0,
                    itemsCount: 0,
                    supplies: []
                };
                dayMap.set(day, dayGroup);
                grouped.push(dayGroup);
            }

            const dayGroup = dayMap.get(day);
            const supplyItems = itemsBySupply.get(row.id) || [];
            const itemCount = supplyItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);

            dayGroup.supplies.push({
                id: row.id,
                order_id: row.order_id,
                order_number: row.order_number,
                state: row.state,
                bundle_id: row.bundle_id,
                supply_id: row.supply_id,
                arrival_date: row.arrival_date,
                order_created_date: row.order_created_date,
                warehouse_name: row.warehouse_name,
                warehouse_address: row.warehouse_address,
                shipment_applied: !!row.shipment_applied,
                shipment_operation_id: row.shipment_operation_id,
                itemCount,
                items: supplyItems
            });
            dayGroup.supplyCount += 1;
            dayGroup.itemsCount += itemCount;
        }

        grouped.forEach((dayGroup) => {
            const skuSet = new Set();
            dayGroup.supplies.forEach((supply) => {
                supply.items.forEach((item) => {
                    skuSet.add(String(item.sku || ''));
                });
            });
            dayGroup.skuCount = skuSet.size;
        });

        return grouped;
    }

    async createShipmentsFromFbo(selectedDays = null) {
        await this.ensureFboTables();
        const groupedByDay = await this.loadFboDailyStats();
        const daysToProcess = selectedDays
            ? groupedByDay.filter((day) => selectedDays.includes(day.day))
            : groupedByDay;

        const results = [];

        for (const day of daysToProcess) {
            for (const supply of day.supplies || []) {
                // Защита от повторного списания: если операция по bundle уже существует,
                // помечаем поставку как обработанную и повторно не проводим.
                const existingByBundle = await this.pool.query(
                    `SELECT id FROM operations
                     WHERE type = 'shipment' AND note LIKE $1
                     ORDER BY id DESC
                     LIMIT 1`,
                    [`%bundle ${supply.bundle_id}%`]
                );

                if (existingByBundle.rows.length > 0) {
                    const existingOpId = existingByBundle.rows[0].id;
                    await this.pool.query(
                        `UPDATE ozon_fbo_supplies
                         SET shipment_applied = true,
                             shipment_operation_id = $2,
                             updated_at = NOW()
                         WHERE id = $1`,
                        [supply.id, existingOpId]
                    );
                    results.push({
                        day: day.day,
                        supplyId: supply.id,
                        orderNumber: supply.order_number,
                        status: 'already_processed'
                    });
                    continue;
                }

                if (supply.shipment_applied) {
                    results.push({
                        day: day.day,
                        supplyId: supply.id,
                        orderNumber: supply.order_number,
                        status: 'already_processed'
                    });
                    continue;
                }

                const client = await this.pool.connect();
                try {
                    await client.query('BEGIN');

                    const items = [];
                    let total_quantity = 0;
                    const errors = [];
                    const mismatches = [];

                    for (const item of supply.items || []) {
                        const dbItem = await this.findProductByOzonSku(item.sku, item.offer_id);
                        if (!dbItem) {
                            const mismatch = {
                                sku: item.sku,
                                name: item.name || 'Неизвестно',
                                required: item.quantity,
                                reason: 'Товар не найден в базе данных'
                            };
                            errors.push(`Товар не найден: OZN${item.sku}`);
                            mismatches.push(mismatch);
                            continue;
                        }

                        if (Number(dbItem.quantity || 0) < Number(item.quantity || 0)) {
                            const mismatch = {
                                sku: dbItem.sku,
                                name: dbItem.name,
                                inStock: Number(dbItem.quantity || 0),
                                required: Number(item.quantity || 0),
                                shortage: Number(item.quantity || 0) - Number(dbItem.quantity || 0),
                                reason: 'Недостаточно товара на складе'
                            };
                            errors.push(
                                `Недостаточно товара ${dbItem.sku} (${dbItem.name}). На складе: ${dbItem.quantity}, требуется: ${item.quantity}`
                            );
                            mismatches.push(mismatch);
                            continue;
                        }

                        items.push({
                            quantity: Number(item.quantity || 0),
                            productId: dbItem.id,
                            productSKU: dbItem.sku,
                            productName: dbItem.name
                        });
                        total_quantity += Number(item.quantity || 0);

                        await client.query(
                            'UPDATE products SET quantity = quantity - $1, updated_at = NOW() WHERE id = $2',
                            [Number(item.quantity || 0), dbItem.id]
                        );
                    }

                    if (errors.length > 0) {
                        await client.query('ROLLBACK');
                        results.push({
                            day: day.day,
                            supplyId: supply.id,
                            orderNumber: supply.order_number,
                            status: 'error',
                            errorCount: errors.length,
                            errors,
                            mismatches
                        });
                        continue;
                    }

                    if (items.length === 0) {
                        await client.query('ROLLBACK');
                        results.push({
                            day: day.day,
                            supplyId: supply.id,
                            orderNumber: supply.order_number,
                            status: 'error',
                            error: 'Нет товаров для отгрузки'
                        });
                        continue;
                    }

                    const note = `OZON FBO от ${day.day} #${supply.order_number || supply.order_id} bundle ${supply.bundle_id}`;
                    const opResult = await client.query(
                        `INSERT INTO operations (type, operation_date, note, items, total_quantity, differences)
                         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
                        ['shipment', day.day, note, JSON.stringify(items), total_quantity, JSON.stringify([])]
                    );
                    const operation = opResult.rows[0];

                    await client.query(
                        `UPDATE ozon_fbo_supplies
                         SET shipment_applied = true,
                             shipment_operation_id = $2,
                             updated_at = NOW()
                         WHERE id = $1`,
                        [supply.id, operation.id]
                    );

                    await client.query('COMMIT');
                    results.push({
                        day: day.day,
                        supplyId: supply.id,
                        orderNumber: supply.order_number,
                        status: 'success',
                        operationId: operation.id,
                        itemsCount: items.length,
                        totalQuantity: total_quantity
                    });
                } catch (error) {
                    await client.query('ROLLBACK');
                    results.push({
                        day: day.day,
                        supplyId: supply.id,
                        orderNumber: supply.order_number,
                        status: 'error',
                        error: error.message
                    });
                } finally {
                    client.release();
                }
            }
        }

        const successCount = results.filter((r) => r.status === 'success').length;
        const errorCount = results.filter((r) => r.status === 'error').length;
        const alreadyProcessedCount = results.filter((r) => r.status === 'already_processed').length;

        return {
            summary: {
                total: results.length,
                success: successCount,
                errors: errorCount,
                alreadyProcessed: alreadyProcessedCount
            },
            details: results
        };
    }
}

module.exports = OzonService;
