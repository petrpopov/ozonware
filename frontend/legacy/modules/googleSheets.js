import { apiCall } from './api.js';

let googleSheetsConfig = {
    spreadsheetId: '',
    sheetName: 'Лист1',
    skuColumn: 'A',
    quantityColumn: 'B',
    startRow: 2
};

export async function loadGoogleSheetsSettings() {
    try {
        const config = await apiCall('/api/google-sheets-config');
        if (config) {
            googleSheetsConfig = config;

            document.getElementById('googleSheetId').value = googleSheetsConfig.spreadsheetId || '';
            document.getElementById('googleSheetName').value = googleSheetsConfig.sheetName || 'Лист1';
            document.getElementById('googleSkuColumn').value = googleSheetsConfig.skuColumn || 'A';
            document.getElementById('googleQuantityColumn').value = googleSheetsConfig.quantityColumn || 'B';
            document.getElementById('googleStartRow').value = googleSheetsConfig.startRow || 2;
        }
    } catch (error) {
        console.error('Failed to load Google Sheets settings:', error);
    }
}

export async function saveGoogleSheetsSettings() {
    const config = {
        spreadsheetId: document.getElementById('googleSheetId').value.trim(),
        sheetName: document.getElementById('googleSheetName').value.trim() || 'Лист1',
        skuColumn: document.getElementById('googleSkuColumn').value.trim().toUpperCase() || 'A',
        quantityColumn: document.getElementById('googleQuantityColumn').value.trim().toUpperCase() || 'B',
        startRow: parseInt(document.getElementById('googleStartRow').value) || 2
    };

    try {
        googleSheetsConfig = await apiCall('/api/google-sheets-config', 'POST', config);
        showSyncResult('✅ Настройки сохранены!', 'success');
    } catch (error) {
        console.error('Failed to save settings:', error);
        showSyncResult('❌ Ошибка сохранения: ' + error.message, 'error');
    }
}

export async function testGoogleSheetsConnection() {
    if (!googleSheetsConfig.spreadsheetId) {
        showSyncResult('❌ Заполните Spreadsheet ID', 'error');
        return;
    }

    showSyncResult('🔌 Проверка подключения...', 'info');

    try {
        const result = await apiCall('/api/google-sheets-test', 'POST', googleSheetsConfig);

        if (result.success) {
            const sheetsList = result.sheets ? result.sheets.join(', ') : '';
            showSyncResult(
                `✅ Подключение успешно!<br>` +
                `Таблица: ${result.title}<br>` +
                `Листы: ${sheetsList}`,
                'success'
            );
        } else {
            showSyncResult(`❌ Ошибка: ${result.error}`, 'error');
        }
    } catch (error) {
        console.error('Connection test failed:', error);
        showSyncResult(`❌ Ошибка: ${error.message}`, 'error');
    }
}

export async function syncToGoogleSheets() {
    if (!googleSheetsConfig.spreadsheetId) {
        showSyncResult('❌ Сначала настройте и сохраните Spreadsheet ID', 'error');
        return;
    }

    document.getElementById('syncProgress').style.display = 'block';
    document.getElementById('syncResult').innerHTML = '';
    updateSyncProgress('Отправка запроса на сервер...', 0, 100);

    try {
        const result = await apiCall('/api/google-sheets-sync', 'POST', googleSheetsConfig);

        if (result.success) {
            updateSyncProgress('Готово!', 100, 100);
            showSyncResult(
                `✅ Синхронизация завершена!<br>` +
                `Обновлено строк: ${result.updated}<br>` +
                `Совпадений по SKU: ${result.matched}<br>` +
                `Не найдено в таблице: ${result.notFound}`,
                'success'
            );
        } else {
            showSyncResult(`❌ Ошибка: ${result.error}`, 'error');
        }

        setTimeout(() => {
            document.getElementById('syncProgress').style.display = 'none';
        }, 3000);

    } catch (error) {
        console.error('Sync error:', error);
        showSyncResult(`❌ Ошибка синхронизации: ${error.message}`, 'error');
        document.getElementById('syncProgress').style.display = 'none';
    }
}

function updateSyncProgress(status, current, total) {
    document.getElementById('syncStatus').textContent = status;
    document.getElementById('syncCounter').textContent = `${current} / ${total}`;

    const percentage = total > 0 ? (current / total * 100) : 0;
    document.getElementById('syncProgressBar').style.width = percentage + '%';
}

function showSyncResult(message, type) {
    const colors = {
        success: '#d4edda',
        error: '#f8d7da',
        warning: '#fff3cd',
        info: '#d1ecf1'
    };

    const textColors = {
        success: '#155724',
        error: '#721c24',
        warning: '#856404',
        info: '#0c5460'
    };

    document.getElementById('syncResult').innerHTML = `
        <div style="background: ${colors[type]}; color: ${textColors[type]}; padding: 15px; border-radius: 8px; border: 1px solid ${textColors[type]};">
            ${message}
        </div>
    `;
}
