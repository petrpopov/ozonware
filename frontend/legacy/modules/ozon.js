import { API_URL } from './api.js';

let ozonSyncEventSource = null;

export async function loadOzonSettings() {
    try {
        const response = await fetch(`${API_URL}/api/ozon/settings`);
        if (!response.ok) {
            console.log('OZON settings not configured yet');
            return;
        }

        const settings = await response.json();

        document.getElementById('ozonClientId').value = settings.clientId || '';
        document.getElementById('ozonApiKey').value = settings.apiKey || '';

        if (settings.syncStartDate) {
            const date = new Date(settings.syncStartDate);
            const localDateTime = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
                .toISOString()
                .slice(0, 16);
            document.getElementById('ozonSyncStartDate').value = localDateTime;
        }
    } catch (error) {
        console.error('Error loading OZON settings:', error);
    }
}

export async function saveOzonSettings() {
    const clientId = document.getElementById('ozonClientId').value.trim();
    const apiKey = document.getElementById('ozonApiKey').value.trim();
    const syncStartDate = document.getElementById('ozonSyncStartDate').value;

    if (!clientId || !apiKey || !syncStartDate) {
        showOzonSettingsAlert('Заполните все обязательные поля', 'error');
        return;
    }

    const moscowDate = new Date(syncStartDate);
    const moscowISO = moscowDate.toISOString().replace('Z', '+03:00');

    const settings = {
        clientId: clientId,
        apiKey: apiKey,
        syncStartDate: moscowISO
    };

    try {
        const response = await fetch(`${API_URL}/api/ozon/settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings)
        });

        if (!response.ok) {
            throw new Error('Failed to save settings');
        }

        showOzonSettingsAlert('✅ Настройки OZON сохранены', 'success');
    } catch (error) {
        console.error('Error saving OZON settings:', error);
        showOzonSettingsAlert('❌ Ошибка сохранения настроек: ' + error.message, 'error');
    }
}

export async function testOzonConnection() {
    showOzonSettingsAlert('🔗 Проверка подключения...', 'info');

    try {
        const response = await fetch(`${API_URL}/api/ozon/test`);
        const result = await response.json();

        if (result.success) {
            showOzonSettingsAlert('✅ Подключение к OZON API успешно!', 'success');
        } else {
            showOzonSettingsAlert(`❌ Ошибка: ${result.error}`, 'error');
        }
    } catch (error) {
        showOzonSettingsAlert(`❌ Ошибка: ${error.message}`, 'error');
    }
}

function showOzonSettingsAlert(message, type) {
    const alertDiv = document.getElementById('ozonSettingsAlert');
    const className = type === 'success' ? 'alert-success' : type === 'error' ? 'alert-error' : 'alert-info';
    alertDiv.innerHTML = `<div class="${className}">${message}</div>`;

    if (type === 'success') {
        setTimeout(() => { alertDiv.innerHTML = ''; }, 3000);
    }
}

export function openOzonSyncModal() {
    document.getElementById('ozonSyncModal').classList.add('active');
    document.getElementById('ozonSyncResults').style.display = 'none';
    document.getElementById('ozonSyncStartBtn').style.display = 'inline-block';
    document.getElementById('ozonSyncMessage').textContent = 'Нажмите "Начать синхронизацию" для загрузки заказов OZON';

    loadOzonShipments()
        .then(result => { console.log('Результат:', result); })
        .catch(error => { console.error('Ошибка:', error); });
}

export function closeOzonSyncModal() {
    if (ozonSyncEventSource) {
        ozonSyncEventSource.close();
        ozonSyncEventSource = null;
    }
    document.getElementById('ozonSyncModal').classList.remove('active');
}

export function startOzonSync() {
    const startBtn = document.getElementById('ozonSyncStartBtn');
    const spinner = document.getElementById('ozonSyncSpinner');
    const messageDiv = document.getElementById('ozonSyncMessage');
    const resultsDiv = document.getElementById('ozonSyncResults');

    startBtn.style.display = 'none';
    spinner.style.display = 'block';
    resultsDiv.style.display = 'none';
    messageDiv.textContent = 'Инициализация синхронизации...';

    ozonSyncEventSource = new EventSource(`${API_URL}/api/ozon/sync`, {
        method: 'POST'
    });

    ozonSyncEventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.status === 'loading') {
            messageDiv.innerHTML = `🔄 ${data.message}`;
        } else if (data.status === 'processing') {
            messageDiv.innerHTML = `⚙️ ${data.message}`;
        } else if (data.status === 'saving') {
            messageDiv.innerHTML = `💾 ${data.message}`;
        } else if (data.status === 'complete') {
            spinner.style.display = 'none';
            messageDiv.innerHTML = `✅ ${data.message}`;

            if (data) {
                console.log('ozon sync loaded');
                loadOzonShipments()
                    .then(result => { console.log('Результат:', result); })
                    .catch(error => { console.error('Ошибка:', error); });
            }

            ozonSyncEventSource.close();
            ozonSyncEventSource = null;
        } else if (data.status === 'error') {
            spinner.style.display = 'none';
            messageDiv.innerHTML = `❌ ${data.message}`;
            startBtn.style.display = 'inline-block';

            ozonSyncEventSource.close();
            ozonSyncEventSource = null;
        }
    };

    ozonSyncEventSource.onerror = (error) => {
        console.error('EventSource error:', error);
        spinner.style.display = 'none';
        messageDiv.textContent = '❌ Ошибка соединения с сервером';
        startBtn.style.display = 'inline-block';

        if (ozonSyncEventSource) {
            ozonSyncEventSource.close();
            ozonSyncEventSource = null;
        }
    };
}

async function loadOzonShipments() {
    try {
        const response = await fetch(`${API_URL}/api/ozon/shipments`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const text = await response.text();
        const shipments = JSON.parse(text);
        displayOzonSyncResults(shipments);
    } catch (error) {
        console.error('Error loading shipments:', error);
        return [];
    }
}

function displayOzonSyncResults(statsArray) {
    const resultsDiv = document.getElementById('ozonSyncResults');
    const statsDiv = document.getElementById('ozonSyncStats');
    const daysListDiv = document.getElementById('ozonDaysList');

    if (!statsArray || statsArray.length === 0) return;

    window.ozonDailyStatsData = statsArray;

    const orderCount = statsArray.reduce((sum, day) => sum + parseInt(day.orderCount || 0), 0);
    const totalDays = statsArray.length;
    const itemsCount = statsArray.reduce((sum, day) => sum + parseInt(day.itemsCount || 0), 0);

    statsDiv.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px;">
            <div style="text-align: center;">
                <div style="font-size: 13px; color: #888;">Всего заказов</div>
                <div style="font-size: 24px; font-weight: bold; color: #667eea;">${orderCount}</div>
            </div>
            <div style="text-align: center;">
                <div style="font-size: 13px; color: #888;">Дней</div>
                <div style="font-size: 24px; font-weight: bold; color: #667eea;">${totalDays}</div>
            </div>
            <div style="text-align: center;">
                <div style="font-size: 13px; color: #888;">Штук</div>
                <div style="font-size: 24px; font-weight: bold; color: #667eea;">${itemsCount}</div>
            </div>
        </div>
    `;

    daysListDiv.innerHTML = statsArray.map((day, index) => {
        const dayDate = new Date(day.day);
        const isInvalidDate = dayDate.getFullYear() < 2000;
        const dayFormatted = isInvalidDate
            ? "Без даты / Ошибка"
            : dayDate.toLocaleDateString('ru-RU', {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
            });

        return `
            <div class="ozon-day-item" id="ozon-day-${index}">
                <div class="ozon-day-header" onclick="toggleOzonDay(${index}, '${day.delivery_day}')">
                    <div>
                        <strong>${dayFormatted}</strong>
                        <div style="font-size: 13px; margin-top: 5px; color: var(--text-secondary);">
                            🚛 ${day.orderCount} заказов | 📊 ${day.skuCount} позиций | 📦 ${day.itemsCount} штук
                        </div>
                    </div>
                    <span class="ozon-day-arrow">▼</span>
                </div>
                <div class="ozon-day-body" id="ozon-day-body-${index}">
                    <div style="text-align: center; color: var(--text-secondary);">Загрузка деталей...</div>
                </div>
            </div>
        `;
    }).join('');

    resultsDiv.style.display = 'block';

    // Show process FBS button
    const processFbsBtn = document.getElementById('ozonProcessFbsBtn');
    if (processFbsBtn) {
        processFbsBtn.style.display = 'inline-block';
    }
}

export async function toggleOzonDay(index, deliveryDay) {
    const dayItem = document.getElementById(`ozon-day-${index}`);
    const dayBody = document.getElementById(`ozon-day-body-${index}`);

    if (dayItem.classList.contains('active')) {
        dayItem.classList.remove('active');
        return;
    }

    document.querySelectorAll('.ozon-day-item').forEach(item => item.classList.remove('active'));
    dayItem.classList.add('active');

    const dayData = window.ozonDailyStatsData?.[index];

    if (!dayData || (!dayData.orders || dayData.orders.length === 0) && (!dayData.items || dayData.items.length === 0)) {
        dayBody.innerHTML = '<div style="text-align: center; padding: 20px;">Нет данных</div>';
        return;
    }

    dayBody.innerHTML = `
        <div style="background: var(--bg-primary); border-radius: 8px; overflow: hidden;">
            <div style="display: flex; border-bottom: 2px solid var(--border-color); background: var(--bg-secondary);">
                <button
                    class="ozon-tab-btn active"
                    onclick="switchOzonTab(${index}, 'orders')"
                    data-tab="orders"
                    style="flex: 1; padding: 12px 20px; border: none; background: transparent; cursor: pointer; font-weight: 600; transition: all 0.2s;"
                >
                    📦 Заказы (${dayData.orderCount})
                </button>
                <button
                    class="ozon-tab-btn"
                    onclick="switchOzonTab(${index}, 'items')"
                    data-tab="items"
                    style="flex: 1; padding: 12px 20px; border: none; background: transparent; cursor: pointer; font-weight: 600; transition: all 0.2s;"
                >
                    📊 Товары (${dayData.skuCount})
                </button>
            </div>
            <div id="ozon-tab-content-${index}">
                ${renderOrdersTab(dayData)}
            </div>
        </div>
    `;

    const style = document.createElement('style');
    style.textContent = `
        .ozon-tab-btn.active {
            background: var(--bg-primary) !important;
            color: var(--primary-color) !important;
            border-bottom: 3px solid var(--primary-color) !important;
        }
        .ozon-tab-btn:hover {
            background: var(--bg-hover) !important;
        }
    `;
    if (!document.getElementById('ozon-tabs-style')) {
        style.id = 'ozon-tabs-style';
        document.head.appendChild(style);
    }
}

export function switchOzonTab(index, tabName) {
    const dayData = window.ozonDailyStatsData?.[index];
    const contentDiv = document.getElementById(`ozon-tab-content-${index}`);

    const dayBody = document.getElementById(`ozon-day-body-${index}`);
    dayBody.querySelectorAll('.ozon-tab-btn').forEach(btn => btn.classList.remove('active'));
    dayBody.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

    if (tabName === 'orders') {
        contentDiv.innerHTML = renderOrdersTab(dayData);
    } else {
        contentDiv.innerHTML = renderItemsTab(dayData);
    }
}

function renderOrdersTab(dayData) {
    if (!dayData.orders || dayData.orders.length === 0) {
        return '<div style="text-align: center; padding: 20px;">Нет заказов</div>';
    }

    return `
        <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
            <thead>
                <tr style="background: var(--bg-secondary); border-bottom: 2px solid var(--border-color);">
                    <th style="padding: 12px; text-align: left; font-weight: 600;">Номер заказа</th>
                    <th style="padding: 12px; text-align: center; font-weight: 600;">Статус</th>
                    <th style="padding: 12px; text-align: center; font-weight: 600;">Шт.</th>
                    <th style="padding: 12px; text-align: center; font-weight: 600;">SKU</th>
                    <th style="padding: 12px; text-align: left; font-weight: 600;">Состав заказа</th>
                </tr>
            </thead>
            <tbody>
                ${dayData.orders.map((order, idx) => {
                    const orderComposition = order.items.map(item => `${item.sku}: ${item.quantity}`).join(', ');
                    return `
                        <tr style="border-bottom: 1px solid var(--border-color); ${idx % 2 === 0 ? 'background: var(--bg-secondary);' : ''}">
                            <td style="padding: 10px; font-family: monospace; font-size: 13px;">${order.posting_number}</td>
                            <td style="padding: 10px; text-align: center;">
                                <span style="padding: 4px 8px; border-radius: 4px; background: var(--bg-hover); font-size: 12px;">
                                    ${order.status}
                                </span>
                            </td>
                            <td style="padding: 10px; text-align: center; font-weight: bold; color: var(--primary-color); font-size: 16px;">
                                ${order.itemCount}
                            </td>
                            <td style="padding: 10px; text-align: center; font-weight: 600;">
                                ${order.items.length}
                            </td>
                            <td style="padding: 10px; font-family: monospace; font-size: 12px; color: var(--text-secondary);">
                                ${orderComposition}
                            </td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;
}

function renderItemsTab(dayData) {
    if (!dayData.items || dayData.items.length === 0) {
        return '<div style="text-align: center; padding: 20px;">Нет товаров</div>';
    }

    return `
        <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
            <thead>
                <tr style="background: var(--bg-secondary); border-bottom: 2px solid var(--border-color);">
                    <th style="padding: 12px; text-align: left; font-weight: 600; width: 150px;">SKU</th>
                    <th style="padding: 12px; text-align: left; font-weight: 600;">Название товара</th>
                    <th style="padding: 12px; text-align: center; font-weight: 600; width: 100px;">Количество</th>
                    <th style="padding: 12px; text-align: left; font-weight: 600;">Номера заказов</th>
                </tr>
            </thead>
            <tbody>
                ${dayData.items.map((item, idx) => `
                    <tr style="border-bottom: 1px solid var(--border-color); ${idx % 2 === 0 ? 'background: var(--bg-secondary);' : ''}">
                        <td style="padding: 10px; font-family: monospace; color: var(--text-secondary); font-size: 13px;">
                            ${item.sku}
                        </td>
                        <td style="padding: 10px;">
                            ${item.name}
                        </td>
                        <td style="padding: 10px; text-align: center; font-weight: bold; color: var(--primary-color); font-size: 16px;">
                            ${item.quantity}
                        </td>
                        <td style="padding: 10px; font-family: monospace; font-size: 12px; color: var(--text-secondary);">
                            ${item.orders.join(', ')}
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

export async function processAllFbsOrders() {
    const processFbsBtn = document.getElementById('ozonProcessFbsBtn');

    if (!window.ozonDailyStatsData || window.ozonDailyStatsData.length === 0) {
        alert('Нет данных для обработки');
        return;
    }

    if (!confirm('Вы уверены, что хотите провести отгрузки для всех дней? Это изменит количество товаров на складе.')) {
        return;
    }

    processFbsBtn.disabled = true;
    processFbsBtn.textContent = '⏳ Обработка...';

    try {
        const response = await fetch(`${API_URL}/api/ozon/shipments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        const result = await response.json();
        if (result.success) {
            console.log(`✅ Отгрузки созданы`);
        }
    } catch (error) {
        console.error(`❌ Ошибка:`, error);
    }

    let message = `Обработка завершена!\n\n`;
    alert(message);

    processFbsBtn.disabled = false;
    processFbsBtn.textContent = '✅ Провести заказы FBS';

    await loadOzonShipments();
}
