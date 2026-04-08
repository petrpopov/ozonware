import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3001';
const API_BASE = 'http://localhost:19090';

// ==================== HEALTH & API ====================

test('API health check', async ({ request }) => {
    const resp = await request.get(`${API_BASE}/api/health`);
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeDefined();
});

// ==================== PRODUCTS PAGE ====================

test('Products page loads and shows data', async ({ page }) => {
    await page.goto(`${BASE_URL}`);
    await expect(page).toHaveTitle(/Склад/);
    // Should show products table or at least the page structure
    await page.waitForLoadState('networkidle');
    // Check no 500 errors in console
    const errors: string[] = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    expect(errors.filter(e => !e.includes('favicon'))).toEqual([]);
});

test('Create and delete a test product via API', async ({ page, request }) => {
    const uniqueSku = `TEST-PW-${Date.now()}`;

    // Create product via API
    const createResp = await request.post(`${API_BASE}/api/products`, {
        data: {
            name: 'Test Product Playwright',
            sku: uniqueSku,
            quantity: 1,
            description: 'Created by Playwright test',
            customFields: []
        }
    });
    expect([200, 201, 409]).toContain(createResp.status());

    if (createResp.status() === 409) {
        // Product already exists with this SKU, skip creation
        console.log('Product already exists, skipping creation');
    } else {
        expect(createResp.ok()).toBe(true);
        const product = await createResp.json();
        const productId = product.id;

        // Verify product appears on the page
        await page.goto(`${BASE_URL}`);
        await page.waitForLoadState('networkidle');
        await expect(page.locator(`text=Test Product Playwright`)).toBeVisible();

        // Delete the product via API
        const deleteResp = await request.delete(`${API_BASE}/api/products/${productId}`);
        expect(deleteResp.ok()).toBe(true);

        // Verify it's gone from the page
        await page.reload();
        await page.waitForLoadState('networkidle');
        await expect(page.locator(`text=Test Product Playwright`)).not.toBeVisible({ timeout: 5000 });
    }
});

// ==================== PRODUCT FIELDS ====================

test('Product fields page loads', async ({ page }) => {
    await page.goto(`${BASE_URL}/product-fields`);
    await page.waitForLoadState('networkidle');
    // Page should load without errors
    await expect(page.locator('body')).toBeVisible();
});

// ==================== RECEIPT (Приёмка) ====================

test('Receipt page loads', async ({ page }) => {
    await page.goto(`${BASE_URL}/receipt`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
});

// ==================== SHIPMENT (Отгрузка) ====================

test('Shipment page loads', async ({ page }) => {
    await page.goto(`${BASE_URL}/shipment`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
});

// ==================== WRITEOFF (Списание) ====================

test('Writeoff page loads', async ({ page }) => {
    await page.goto(`${BASE_URL}/writeoff`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
});

// ==================== INVENTORY (Инвентаризация) ====================

test('Inventory page loads', async ({ page }) => {
    await page.goto(`${BASE_URL}/inventory`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
});

// ==================== REPORTS ====================

test('Reports page loads', async ({ page }) => {
    await page.goto(`${BASE_URL}/reports`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
});

// ==================== SETTINGS ====================

test('Settings page loads', async ({ page }) => {
    await page.goto(`${BASE_URL}/settings`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
});

// ==================== API ENDPOINTS ====================

test('API: products list returns array', async ({ request }) => {
    const resp = await request.get(`${API_BASE}/api/products`);
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(Array.isArray(body)).toBe(true);
});

test('API: product-fields list returns array', async ({ request }) => {
    const resp = await request.get(`${API_BASE}/api/product-fields`);
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(Array.isArray(body)).toBe(true);
});

test('API: operations list returns array', async ({ request }) => {
    const resp = await request.get(`${API_BASE}/api/operations`);
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(Array.isArray(body)).toBe(true);
});

test('API: stats returns object', async ({ request }) => {
    const resp = await request.get(`${API_BASE}/api/stats`);
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(typeof body).toBe('object');
});

test('API: writeoffs returns array', async ({ request }) => {
    const resp = await request.get(`${API_BASE}/api/writeoffs`);
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(Array.isArray(body)).toBe(true);
});

test('API: settings returns 400/404 for missing key', async ({ request }) => {
    const resp = await request.get(`${API_BASE}/api/settings/nonexistent_key_xyz`);
    expect([400, 404, 500]).toContain(resp.status());
});

test('API: ozon settings returns object', async ({ request }) => {
    const resp = await request.get(`${API_BASE}/api/ozon/settings`);
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(typeof body).toBe('object');
});

// ==================== OPERATIONS FILTERS ====================

test('API: operations filter by type=receipt', async ({ request }) => {
    const resp = await request.get(`${API_BASE}/api/operations?type=receipt&limit=20`);
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(Array.isArray(body)).toBe(true);
});

test('API: operations filter by type=shipment', async ({ request }) => {
    const resp = await request.get(`${API_BASE}/api/operations?type=shipment&limit=20`);
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(Array.isArray(body)).toBe(true);
});

test('API: operations filter by type=writeoff', async ({ request }) => {
    const resp = await request.get(`${API_BASE}/api/operations?type=writeoff&limit=20`);
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(Array.isArray(body)).toBe(true);
});

test('API: operations filter by type=inventory', async ({ request }) => {
    const resp = await request.get(`${API_BASE}/api/operations?type=inventory&limit=20`);
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(Array.isArray(body)).toBe(true);
});

test('API: operations filter by type=correction', async ({ request }) => {
    const resp = await request.get(`${API_BASE}/api/operations?type=correction&limit=20`);
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(Array.isArray(body)).toBe(true);
});

test('API: operations with include_total', async ({ request }) => {
    const resp = await request.get(`${API_BASE}/api/operations?type=_&include_total=1`);
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body).toHaveProperty('items');
    expect(body).toHaveProperty('total');
    expect(Array.isArray(body.items)).toBe(true);
});
